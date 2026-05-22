import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findCompanyIdForLineUser,
  logLineConversation,
} from "../../lib/conversationsServer";
import { sendLineReplyMessage } from "../../lib/lineMessaging";
import { loadLineReminderSettings } from "../../lib/lineReminderSettingsServer";
import { getSupabaseServer } from "../../lib/supabaseServer";
import { DEFAULT_COMPANY_ID } from "../../lib/companyContext";

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

const BIND_FAILED_REPLY = "綁定失敗，請稍後再試。";

const BIND_INSTRUCTION_REPLY =
  "我已收到您的訊息，目前請輸入「綁定」完成 LINE CRM 通知設定。";

const CUSTOMER_NOT_FOUND_REPLY = "找不到客戶資料";

const BIND_COMMAND = "綁定";

const DEFAULT_LINE_CUSTOMER_NAME = "LINE 客戶";

/** Exclude soft-deleted customers (same filter as customerSoftDelete.activeCustomersOnly). */
function activeCustomersOnly<T extends { is: (col: string, val: null) => T }>(query: T): T {
  return query.is("deleted_at", null);
}

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

/** Find a CRM customer by name within the active company. */
async function findCustomerByName(
  supabase: SupabaseClient,
  customerName: string,
  companyId: number,
): Promise<CustomerLookupRow | null> {
  const exact = await activeCustomersOnly(
    supabase
      .from("customers")
      .select("id, customer_name")
      .eq("company_id", companyId)
      .eq("customer_name", customerName),
  )
    .limit(1)
    .maybeSingle();

  if (exact.error) {
    console.error("customers exact lookup failed:", exact.error.message);
  } else if (exact.data) {
    return exact.data as CustomerLookupRow;
  }

  const fuzzy = await activeCustomersOnly(
    supabase
      .from("customers")
      .select("id, customer_name")
      .eq("company_id", companyId)
      .ilike("customer_name", `%${customerName}%`),
  )
    .limit(1)
    .maybeSingle();

  if (fuzzy.error) {
    console.error("customers fuzzy lookup failed:", fuzzy.error.message);
    return null;
  }
  return (fuzzy.data as CustomerLookupRow | null) ?? null;
}

/** Find customer already linked to this official LINE userId. */
async function findCustomerByLineUserId(
  supabase: SupabaseClient,
  lineUserId: string,
  companyId: number,
): Promise<CustomerLookupRow | null> {
  const { data, error } = await activeCustomersOnly(
    supabase
      .from("customers")
      .select("id, customer_name")
      .eq("company_id", companyId)
      .eq("line_user_id", lineUserId),
  )
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[line-webhook] customers line_user_id lookup failed:", error.message);
    return null;
  }
  return (data as CustomerLookupRow | null) ?? null;
}

async function createCustomerForLineBind(
  supabase: SupabaseClient,
  companyId: number,
  lineUserId: string,
  displayName: string | null,
): Promise<CustomerLookupRow> {
  const customer_name = displayName?.trim() || DEFAULT_LINE_CUSTOMER_NAME;
  const { data, error } = await supabase
    .from("customers")
    .insert({
      company_id: companyId,
      customer_name,
      line_user_id: lineUserId,
      customer_status: "new_lead",
      status: "new_lead",
    })
    .select("id, customer_name")
    .maybeSingle();

  if (error) {
    throw new Error(`customers insert failed: ${error.message}`);
  }
  if (!data) {
    throw new Error("customers insert returned no row");
  }
  return data as CustomerLookupRow;
}

async function confirmCustomerLineUserIdSaved(
  supabase: SupabaseClient,
  customerId: string,
  companyId: number,
  lineUserId: string,
): Promise<boolean> {
  const { data, error } = await activeCustomersOnly(
    supabase
      .from("customers")
      .select("line_user_id")
      .eq("company_id", companyId)
      .eq("id", customerId),
  ).maybeSingle();

  if (error) {
    console.error("[line-webhook] customers line_user_id verify failed:", error.message);
    return false;
  }
  return data?.line_user_id?.trim() === lineUserId;
}

async function upsertLineUser(
  supabase: SupabaseClient,
  userId: string,
  displayName: string | null,
  customerId: string | null,
  companyId: number,
): Promise<void> {
  const row: Record<string, unknown> = {
    line_user_id: userId,
    display_name: displayName,
    company_id: companyId,
  };
  if (customerId !== null) row.customer_id = customerId;

  const { error } = await supabase
    .from("line_users")
    .upsert(row, { onConflict: "line_user_id" });

  if (error) {
    throw new Error(error.message);
  }
}

/** Persist official LINE userId on the CRM customer row (Messaging API push target). */
async function updateCustomerLineUserId(
  supabase: SupabaseClient,
  customerId: string,
  companyId: number,
  lineUserId: string,
): Promise<void> {
  const { error } = await activeCustomersOnly(
    supabase
      .from("customers")
      .update({ line_user_id: lineUserId })
      .eq("company_id", companyId)
      .eq("id", customerId),
  );

  if (error) {
    throw new Error(`customers.line_user_id update failed: ${error.message}`);
  }
}

async function bindLineUserToCustomer(
  supabase: SupabaseClient,
  lineUserId: string,
  displayName: string | null,
  customer: CustomerLookupRow,
  companyId: number,
): Promise<boolean> {
  const customerId = String(customer.id);
  await upsertLineUser(supabase, lineUserId, displayName, customerId, companyId);
  await updateCustomerLineUserId(supabase, customerId, companyId, lineUserId);
  return confirmCustomerLineUserIdSaved(supabase, customerId, companyId, lineUserId);
}

async function replyBindSuccess(
  replyToken: string,
  channelAccessToken: string,
  customer: CustomerLookupRow,
  fallbackName: string,
): Promise<void> {
  const matchedName = customer.customer_name?.trim() || fallbackName;
  const message =
    matchedName && matchedName !== DEFAULT_LINE_CUSTOMER_NAME
      ? `已綁定客戶：${matchedName} ✅`
      : BIND_SUCCESS_REPLY;
  await sendLineReplyMessage(replyToken, message, channelAccessToken);
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

/**
 * Resolve which tenant this LINE message belongs to.
 *
 * 1. If the LINE user is already bound (line_users row exists), keep their company.
 * 2. Otherwise fall back to DEFAULT_COMPANY_ID (env override `DEFAULT_COMPANY_ID`).
 *
 * The webhook is a single LINE channel — one tenant per channel — so the default
 * is the right answer for any deployment with one company.
 */
async function resolveCompanyForLineUser(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<number> {
  if (!userId) return DEFAULT_COMPANY_ID;
  try {
    const bound = await findCompanyIdForLineUser(supabase, userId);
    return bound ?? DEFAULT_COMPANY_ID;
  } catch (err) {
    console.error("[line-webhook] resolveCompanyForLineUser failed:", err);
    return DEFAULT_COMPANY_ID;
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
        const companyId = await resolveCompanyForLineUser(supabase, userId);
        await logLineConversation(supabase, {
          lineUserId: userId,
          messageText,
          direction: "inbound",
          companyId,
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

  const companyId = await resolveCompanyForLineUser(supabase, userId);
  const displayName = await fetchLineDisplayName(userId, channelAccessToken);

  if (command.customerName) {
    const customer = await findCustomerByName(supabase, command.customerName, companyId);
    if (!customer) {
      await sendLineReplyMessage(replyToken, CUSTOMER_NOT_FOUND_REPLY, channelAccessToken);
      return;
    }

    const saved = await bindLineUserToCustomer(supabase, userId, displayName, customer, companyId);
    if (!saved) {
      await sendLineReplyMessage(replyToken, BIND_FAILED_REPLY, channelAccessToken);
      return;
    }
    await replyBindSuccess(replyToken, channelAccessToken, customer, command.customerName);
    return;
  }

  let customer: CustomerLookupRow | null = null;
  if (displayName) {
    customer = await findCustomerByName(supabase, displayName, companyId);
  }
  if (!customer) {
    customer = await findCustomerByLineUserId(supabase, userId, companyId);
  }
  if (!customer) {
    try {
      customer = await createCustomerForLineBind(supabase, companyId, userId, displayName);
    } catch (err) {
      console.error("[line-webhook] createCustomerForLineBind failed:", err);
      await sendLineReplyMessage(replyToken, BIND_FAILED_REPLY, channelAccessToken);
      return;
    }
  }

  const saved = await bindLineUserToCustomer(supabase, userId, displayName, customer, companyId);
  if (!saved) {
    await sendLineReplyMessage(replyToken, BIND_FAILED_REPLY, channelAccessToken);
    return;
  }
  await replyBindSuccess(
    replyToken,
    channelAccessToken,
    customer,
    displayName || DEFAULT_LINE_CUSTOMER_NAME,
  );
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
