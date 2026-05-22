import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findCompanyIdForLineUser, logLineConversation } from "../../lib/conversationsServer";
import {
  buildBindingSuccessNotification,
  buildLineMessageNotification,
  createCrmNotification,
} from "../../lib/crmNotifications";
import { sendLineReplyMessage } from "../../lib/lineMessaging";
import { loadLineReminderSettings } from "../../lib/lineReminderSettingsServer";
import { persistCustomerLineUserId } from "../../lib/lineCustomerBinding";
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

type LineUserRow = {
  line_user_id: string;
  customer_id: string | null;
  display_name: string | null;
  company_id: number | null;
};

type ResolvedLineCustomer = {
  customerId: string;
  customer: CustomerLookupRow;
  createdCustomer: boolean;
  existingLineUser: boolean;
};

const LINE_PROFILE_ENDPOINT = "https://api.line.me/v2/bot/profile";

const BIND_SUCCESS_REPLY =
  "綁定成功 ✅\n之後 CRM 提醒會傳到這個 LINE 帳號。";

const BIND_FAILED_REPLY = "綁定失敗，請稍後再試。";

const BIND_INSTRUCTION_REPLY =
  "我已收到您的訊息，目前請輸入「綁定」完成 LINE CRM 通知設定。";

const BIND_NAME_REQUIRED_REPLY =
  "請輸入「綁定 客戶姓名」以連結既有客戶，或先傳送一般訊息以建立專屬客戶。";

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

async function findLineUserRow(
  supabase: SupabaseClient,
  lineUserId: string,
): Promise<LineUserRow | null> {
  const { data, error } = await supabase
    .from("line_users")
    .select("line_user_id, customer_id, display_name, company_id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (error) {
    console.error("[line-webhook] line_users lookup failed:", error.message);
    return null;
  }
  return (data as LineUserRow | null) ?? null;
}

async function loadCustomerById(
  supabase: SupabaseClient,
  customerId: string,
  companyId: number,
): Promise<CustomerLookupRow | null> {
  const { data, error } = await activeCustomersOnly(
    supabase
      .from("customers")
      .select("id, customer_name")
      .eq("company_id", companyId)
      .eq("id", customerId),
  ).maybeSingle();

  if (error) {
    console.error("[line-webhook] customer load failed:", error.message);
    return null;
  }
  return (data as CustomerLookupRow | null) ?? null;
}

/** Find a CRM customer by name — only for explicit「綁定 客戶名」manual binding. */
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

async function createCustomerForLineUser(
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

async function upsertLineUser(
  supabase: SupabaseClient,
  lineUserId: string,
  displayName: string | null,
  customerId: string,
  companyId: number,
): Promise<void> {
  const { error } = await supabase.from("line_users").upsert(
    {
      line_user_id: lineUserId,
      display_name: displayName,
      company_id: companyId,
      customer_id: customerId,
    },
    { onConflict: "line_user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function ensureCustomerLineUserId(
  supabase: SupabaseClient,
  customerId: string,
  companyId: number,
  lineUserId: string,
): Promise<void> {
  const { ok, error } = await persistCustomerLineUserId(
    supabase,
    customerId,
    lineUserId,
    companyId,
  );
  if (!ok) {
    throw new Error(`customers.line_user_id update failed: ${error ?? "unknown"}`);
  }
}

/**
 * Resolve CRM customer for a LINE user.
 * - Existing line_users row → keep its customer_id (never steal another customer's id).
 * - manualCustomer → explicit「綁定 姓名」only.
 * - Otherwise → create a brand-new customer (no display-name matching).
 */
async function resolveCustomerForLineUser(
  supabase: SupabaseClient,
  lineUserId: string,
  displayName: string | null,
  companyId: number,
  manualCustomer?: CustomerLookupRow | null,
): Promise<ResolvedLineCustomer> {
  console.log("[line-webhook] resolveCustomerForLineUser start:", {
    lineUserId,
    displayName,
    companyId,
    manualBind: Boolean(manualCustomer),
  });

  const existingLineUser = await findLineUserRow(supabase, lineUserId);
  console.log("[line-webhook] existingLineUser:", {
    lineUserId,
    found: Boolean(existingLineUser),
    customer_id: existingLineUser?.customer_id ?? null,
  });

  if (manualCustomer) {
    const customerId = String(manualCustomer.id);
    await upsertLineUser(supabase, lineUserId, displayName, customerId, companyId);
    await ensureCustomerLineUserId(supabase, customerId, companyId, lineUserId);
    console.log("[line-webhook] manual bind final customer_id:", {
      lineUserId,
      createdCustomer_id: customerId,
      finalCustomer_id: customerId,
    });
    return {
      customerId,
      customer: manualCustomer,
      createdCustomer: false,
      existingLineUser: Boolean(existingLineUser),
    };
  }

  const existingCustomerId = existingLineUser?.customer_id?.trim() ?? "";
  if (existingCustomerId) {
    await upsertLineUser(supabase, lineUserId, displayName, existingCustomerId, companyId);
    await ensureCustomerLineUserId(supabase, existingCustomerId, companyId, lineUserId);
    const customer =
      (await loadCustomerById(supabase, existingCustomerId, companyId)) ?? {
        id: existingCustomerId,
        customer_name: displayName,
      };
    console.log("[line-webhook] reuse existing line_users customer_id:", {
      lineUserId,
      finalCustomer_id: existingCustomerId,
    });
    return {
      customerId: existingCustomerId,
      customer,
      createdCustomer: false,
      existingLineUser: true,
    };
  }

  const customer = await createCustomerForLineUser(supabase, companyId, lineUserId, displayName);
  const customerId = String(customer.id);
  await upsertLineUser(supabase, lineUserId, displayName, customerId, companyId);
  await ensureCustomerLineUserId(supabase, customerId, companyId, lineUserId);

  console.log("[line-webhook] created new customer for LINE user:", {
    lineUserId,
    displayName,
    createdCustomer_id: customerId,
    finalCustomer_id: customerId,
  });

  return {
    customerId,
    customer,
    createdCustomer: true,
    existingLineUser: Boolean(existingLineUser),
  };
}

async function notifyBindingSuccess(
  supabase: SupabaseClient,
  companyId: number,
  customer: CustomerLookupRow,
  fallbackName: string,
): Promise<void> {
  const name = customer.customer_name?.trim() || fallbackName;
  const copy = buildBindingSuccessNotification(name, "zh");
  await createCrmNotification(supabase, {
    companyId,
    type: "binding_success",
    title: copy.title,
    body: copy.body,
    customerId: String(customer.id),
    dedupePerDay: true,
  });
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

/** Log inbound messages + provision one CRM customer per LINE userId. */
async function logInboundEvents(
  supabase: SupabaseClient,
  events: LineWebhookEvent[],
  channelAccessToken: string,
): Promise<void> {
  await Promise.all(
    events.map(async (event) => {
      const lineUserId = event.source?.userId?.trim();
      const messageText = event.message?.text;

      if (!lineUserId || !messageText) {
        console.log("[line-webhook] skipping log for event:", {
          type: event.type,
          messageType: event.message?.type,
          hasUserId: Boolean(lineUserId),
          hasText: Boolean(messageText),
        });
        return;
      }

      try {
        const companyId = await resolveCompanyForLineUser(supabase, lineUserId);
        const displayName = await fetchLineDisplayName(lineUserId, channelAccessToken);

        const bindCmd = parseBindCommand(messageText);
        let manualCustomer: CustomerLookupRow | null = null;
        if (bindCmd?.customerName) {
          manualCustomer = await findCustomerByName(
            supabase,
            bindCmd.customerName,
            companyId,
          );
        }

        const resolved = await resolveCustomerForLineUser(
          supabase,
          lineUserId,
          displayName,
          companyId,
          manualCustomer,
        );

        await logLineConversation(supabase, {
          lineUserId,
          messageText,
          direction: "inbound",
          companyId,
          customerId: resolved.customerId,
        });

        console.log("[line-webhook] conversation logged:", {
          lineUserId,
          displayName,
          finalCustomer_id: resolved.customerId,
          createdCustomer: resolved.createdCustomer,
          existingLineUser: resolved.existingLineUser,
        });

        const preview = buildLineMessageNotification(
          resolved.customer.customer_name,
          messageText,
          "zh",
        );
        await createCrmNotification(supabase, {
          companyId,
          type: "line_message",
          title: preview.title,
          body: preview.body,
          customerId: resolved.customerId,
        });
      } catch (err) {
        console.error("[line-webhook] inbound pipeline threw:", {
          lineUserId,
          err,
        });
      }
    }),
  );
}

/** Bind command replies only — customer resolution happens in logInboundEvents first. */
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

  const lineUserId = event.source?.userId?.trim();
  if (!lineUserId) {
    await sendLineReplyMessage(replyToken, BIND_INSTRUCTION_REPLY, channelAccessToken);
    return;
  }

  const companyId = await resolveCompanyForLineUser(supabase, lineUserId);
  const displayName = await fetchLineDisplayName(lineUserId, channelAccessToken);

  console.log("[line-webhook] bind command:", {
    lineUserId,
    displayName,
    namedCustomer: command.customerName,
  });

  if (command.customerName) {
    const manualCustomer = await findCustomerByName(
      supabase,
      command.customerName,
      companyId,
    );
    if (!manualCustomer) {
      await sendLineReplyMessage(replyToken, CUSTOMER_NOT_FOUND_REPLY, channelAccessToken);
      return;
    }

    try {
      const resolved = await resolveCustomerForLineUser(
        supabase,
        lineUserId,
        displayName,
        companyId,
        manualCustomer,
      );
      await notifyBindingSuccess(supabase, companyId, resolved.customer, command.customerName);
      await replyBindSuccess(replyToken, channelAccessToken, resolved.customer, command.customerName);
    } catch (err) {
      console.error("[line-webhook] manual bind failed:", err);
      await sendLineReplyMessage(replyToken, BIND_FAILED_REPLY, channelAccessToken);
    }
    return;
  }

  try {
    const existingLineUser = await findLineUserRow(supabase, lineUserId);
    const resolved = await resolveCustomerForLineUser(
      supabase,
      lineUserId,
      displayName,
      companyId,
    );

    if (existingLineUser?.customer_id?.trim()) {
      await notifyBindingSuccess(
        supabase,
        companyId,
        resolved.customer,
        displayName || DEFAULT_LINE_CUSTOMER_NAME,
      );
      await replyBindSuccess(
        replyToken,
        channelAccessToken,
        resolved.customer,
        displayName || DEFAULT_LINE_CUSTOMER_NAME,
      );
      return;
    }

    await sendLineReplyMessage(replyToken, BIND_NAME_REQUIRED_REPLY, channelAccessToken);
  } catch (err) {
    console.error("[line-webhook] bare bind failed:", err);
    await sendLineReplyMessage(replyToken, BIND_FAILED_REPLY, channelAccessToken);
  }
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
  const channelAccessToken = await resolveChannelAccessToken();

  try {
    if (channelAccessToken) {
      await logInboundEvents(supabase, textEvents, channelAccessToken);
    } else {
      console.error("[line-webhook] no channel access token; skipping inbound pipeline.");
    }
  } catch (err) {
    console.error("[line-webhook] logInboundEvents threw:", err);
  }

  try {
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
