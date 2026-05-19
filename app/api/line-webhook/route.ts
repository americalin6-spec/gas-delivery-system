import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logLineConversation } from "../../lib/conversationsServer";
import { sendLineReplyMessage } from "../../lib/lineMessaging";
import { loadLineReminderSettings } from "../../lib/lineReminderSettingsServer";
import { getSupabaseServer } from "../../lib/supabaseServer";

type LineWebhookBody = {
  events?: LineWebhookEvent[];
};

type LineWebhookEvent = {
  type?: string;
  replyToken?: string;
  source?: {
    type?: string;
    userId?: string;
  };
  message?: {
    type?: string;
    text?: string;
  };
};

type LineProfile = {
  displayName?: string;
};

type CustomerLookupRow = {
  id: string | number;
  customer_name: string | null;
};

const LINE_PROFILE_ENDPOINT = "https://api.line.me/v2/bot/profile";

const BIND_SUCCESS_REPLY =
  "綁定成功 ✅\n之後 CRM 提醒會傳到這個 LINE 帳號。";

const BIND_INSTRUCTION_REPLY =
  "我已收到您的訊息，目前請輸入「綁定」完成 LINE CRM 通知設定。";

const CUSTOMER_NOT_FOUND_REPLY = "找不到客戶資料";

const BIND_COMMAND = "綁定";

function isTextMessageEvent(event: LineWebhookEvent): boolean {
  return event.type === "message" && event.message?.type === "text";
}

/** Parses "綁定" or "綁定 {name}" → { customerName }. Returns null if not a bind command. */
function parseBindCommand(text: string | null | undefined): { customerName: string | null } | null {
  const raw = text?.trim();
  if (!raw) return null;
  if (raw === BIND_COMMAND) return { customerName: null };
  if (!raw.startsWith(BIND_COMMAND)) return null;
  const remainder = raw.slice(BIND_COMMAND.length).trim();
  return { customerName: remainder || null };
}

async function fetchLineDisplayName(userId: string, channelAccessToken: string): Promise<string | null> {
  const token = channelAccessToken.trim();
  if (!token) return null;

  const res = await fetch(`${LINE_PROFILE_ENDPOINT}/${encodeURIComponent(userId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    console.error("LINE profile fetch failed:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const profile = (await res.json()) as LineProfile;
  return profile.displayName?.trim() || null;
}

/** Find a CRM customer by name: exact match first, then case-insensitive substring. */
async function findCustomerByName(
  supabase: SupabaseClient,
  customerName: string,
): Promise<CustomerLookupRow | null> {
  const exact = await supabase
    .from("customers")
    .select("id, customer_name")
    .eq("customer_name", customerName)
    .limit(1)
    .maybeSingle();

  if (exact.error) {
    console.error("customers exact lookup failed:", exact.error.message);
  } else if (exact.data) {
    return exact.data as CustomerLookupRow;
  }

  const fuzzy = await supabase
    .from("customers")
    .select("id, customer_name")
    .ilike("customer_name", `%${customerName}%`)
    .limit(1)
    .maybeSingle();

  if (fuzzy.error) {
    console.error("customers fuzzy lookup failed:", fuzzy.error.message);
    return null;
  }
  return (fuzzy.data as CustomerLookupRow | null) ?? null;
}

async function upsertLineUser(
  supabase: SupabaseClient,
  userId: string,
  displayName: string | null,
  customerId: string | null,
): Promise<void> {
  const row: Record<string, unknown> = {
    line_user_id: userId,
    display_name: displayName,
  };
  if (customerId !== null) row.customer_id = customerId;

  const { error } = await supabase
    .from("line_users")
    .upsert(row, { onConflict: "line_user_id" });

  if (error) {
    throw new Error(error.message);
  }
}

async function resolveChannelAccessToken(): Promise<string> {
  try {
    const settings = await loadLineReminderSettings();
    return process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || settings.channel_access_token.trim();
  } catch (err) {
    console.error("[line-webhook] resolveChannelAccessToken failed:", err);
    return process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? "";
  }
}

/** STEP 1 — Always log every inbound text first, fully isolated from reply/binding. */
async function logInboundEvents(
  supabase: SupabaseClient,
  events: LineWebhookEvent[],
): Promise<void> {
  await Promise.all(
    events.map(async (event) => {
      const userId = event.source?.userId?.trim();
      const messageText = event.message?.text;

      if (!userId || !messageText) {
        console.log("[line-webhook] skipping log for event:", {
          type: event.type,
          messageType: event.message?.type,
          hasUserId: Boolean(userId),
          hasText: Boolean(messageText),
        });
        return;
      }

      try {
        await logLineConversation(supabase, {
          lineUserId: userId,
          messageText,
          direction: "inbound",
        });
      } catch (err) {
        console.error("[line-webhook] logLineConversation threw:", err);
      }
    }),
  );
}

/** STEP 2 — Bind/reply logic. Runs after logging; failures here do not block logging. */
async function handleTextMessage(
  event: LineWebhookEvent,
  channelAccessToken: string,
  supabase: SupabaseClient,
): Promise<void> {
  const replyToken = event.replyToken?.trim();
  if (!replyToken) return;

  const command = parseBindCommand(event.message?.text);
  if (!command) {
    await sendLineReplyMessage(replyToken, BIND_INSTRUCTION_REPLY, channelAccessToken);
    return;
  }

  const userId = event.source?.userId?.trim();
  if (!userId) {
    await sendLineReplyMessage(replyToken, BIND_INSTRUCTION_REPLY, channelAccessToken);
    return;
  }

  const displayName = await fetchLineDisplayName(userId, channelAccessToken);

  if (command.customerName) {
    const customer = await findCustomerByName(supabase, command.customerName);
    if (!customer) {
      await sendLineReplyMessage(replyToken, CUSTOMER_NOT_FOUND_REPLY, channelAccessToken);
      return;
    }

    await upsertLineUser(supabase, userId, displayName, String(customer.id));
    const matchedName = customer.customer_name?.trim() || command.customerName;
    await sendLineReplyMessage(
      replyToken,
      `已綁定客戶：${matchedName} ✅`,
      channelAccessToken,
    );
    return;
  }

  await upsertLineUser(supabase, userId, displayName, null);
  await sendLineReplyMessage(replyToken, BIND_SUCCESS_REPLY, channelAccessToken);
}

export async function POST(req: Request) {
  let body: LineWebhookBody = {};
  try {
    body = (await req.json()) as LineWebhookBody;
  } catch (err) {
    console.error("[line-webhook] invalid JSON body:", err);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const events = body.events ?? [];
  const textEvents = events.filter(isTextMessageEvent);
  console.log("[line-webhook] received events:", {
    total: events.length,
    text: textEvents.length,
  });

  if (textEvents.length === 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const supabase = getSupabaseServer();

  // STEP 1: log inbound messages first — must run regardless of any downstream failure.
  try {
    await logInboundEvents(supabase, textEvents);
  } catch (err) {
    console.error("[line-webhook] logInboundEvents threw:", err);
  }

  // STEP 2: binding + reply logic. Token fetch is wrapped so failure can't block logging.
  try {
    const channelAccessToken = await resolveChannelAccessToken();
    if (channelAccessToken) {
      await Promise.all(
        textEvents.map((event) => handleTextMessage(event, channelAccessToken, supabase)),
      );
    } else {
      console.error("[line-webhook] no channel access token; skipping reply/binding.");
    }
  } catch (err) {
    console.error("[line-webhook] handleTextMessage chain threw:", err);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
