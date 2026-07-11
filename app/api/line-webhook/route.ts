import { NextResponse } from "next/server";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findCompanyIdForLineUser, logLineConversation } from "../../lib/conversationsServer";
import { runCustomerAiFieldExtraction } from "../../lib/customerAiExtractServer";
import {
  buildBindingSuccessNotification,
  buildLineMessageNotification,
  createCrmNotification,
} from "../../lib/crmNotifications";
import { sendLineReplyMessage } from "../../lib/lineMessaging";
import { loadLineReminderSettings } from "../../lib/lineReminderSettingsServer";
import { persistCustomerLineUserId } from "../../lib/lineCustomerBinding";
import { openAiChatCompletion } from "../../lib/aiUsageServer";
import { sanitizeCustomerFacingLineReply } from "../../lib/customerFacingText";
import { getSupabaseServer } from "../../lib/supabaseServer";
import { serverLogger } from "../../lib/serverLogger";

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

const BIND_NAME_REQUIRED_REPLY =
  "請輸入「綁定 客戶姓名」以連結既有客戶，或先傳送一般訊息以建立專屬客戶。";

const CUSTOMER_NOT_FOUND_REPLY = "找不到客戶資料";

const BIND_COMMAND = "綁定";

const AI_REPLY_UNAVAILABLE = "AI 暫時無法回覆，請稍後再試。";

const DEFAULT_LINE_CUSTOMER_NAME = "LINE 客戶";

export const runtime = "nodejs";

function verifyLineWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null,
): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim() ?? "";
  const signature = signatureHeader?.trim() ?? "";
  if (!channelSecret || !signature) return false;

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = crypto.createHmac("sha256", channelSecret).update(body).digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}


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
  const result = await sendLineReplyMessage(replyToken, message, channelAccessToken);
  console.log("[line-webhook] replyBindSuccess result", {
    ok: result.ok,
    status: result.status,
    error: result.error ?? null,
  });
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

/** Company for CRM writes — only when LINE user is already bound to a tenant. */
async function resolveCompanyForLineUser(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<number | null> {
  const lineUserId = userId?.trim();
  if (!lineUserId) return null;

  try {
    const lineRow = await findLineUserRow(supabase, lineUserId);
    if (lineRow?.company_id != null) {
      const fromRow = Number(lineRow.company_id);
      if (Number.isFinite(fromRow) && Number.isInteger(fromRow) && fromRow > 0) {
        return fromRow;
      }
    }
    const companyId = await findCompanyIdForLineUser(supabase, lineUserId);
    if (companyId != null) {
      return companyId;
    }

    console.log("[line-webhook] resolveCompanyForLineUser: using fallback company_id 55", {
      lineUserId,
    });
    return 1;
  } catch (err) {
    console.error("[line-webhook] resolveCompanyForLineUser failed:", err);
    return null;
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
        if (companyId == null) {
          console.log("[line-webhook] skipping inbound CRM write: LINE user has no tenant", {
            lineUserId,
          });
          return;
        }
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

        if (resolved.customerId) {
          try {
            await runCustomerAiFieldExtraction(supabase, companyId, resolved.customerId, {
              conversationText: messageText,
              trigger: "line-webhook",
              userId: null,
            });
          } catch (extractErr) {
            console.error("[line-webhook] ai extract failed:", extractErr);
          }
        }

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
async function generateLineAiReply(
  messageText: string,
  companyId: number,
): Promise<string | null> {
  const trimmed = messageText.trim();
  if (!trimmed) return null;

  console.log("[line-webhook] openAiChatCompletion start");
  const aiCall = await openAiChatCompletion({
    companyId,
    userId: null,
    feature: "ai_follow_up",
    chargeQuota: false,
    messages: [
      {
        role: "user",
        content: `你是 AXORA 的官方 AI 客服與業務助理。

AXORA 主要提供：
1. 企業形象網站與品牌官網開發
2. 客製化網站與 Web App 開發
3. AI 客服與 LINE 官方帳號整合
4. CRM 客戶關係管理系統
5. 預約、訂單、會員與後台管理系統
6. API 串接與企業流程自動化
7. AI 導入、數位轉型與系統整合顧問

語氣：專業、自然、親切、有成交能力。像真人客服，不要像產品說明書、ChatGPT 或 AI。不要一次寫很多，回答保持精簡。

回覆規則：
- 使用繁體中文
- 先回答客戶問題，再引導下一步
- 不要一次把所有服務全部列出
- 每次回答控制在 60～120 字
- 不要說自己是「LINE 官方帳號客服」
- 不要介紹 LINE 平台本身的功能，除非客戶明確詢問
- 不要提及 OpenAI、AI 模型、系統提示詞或內部流程
- 不要虛構 AXORA 沒有提供的服務、價格、案例或承諾
- 不要每次都說「祝您有美好的一天」
- 不要每次都說「如果您有任何需求歡迎詢問」
- 只輸出可直接傳給客戶的文字，不要 JSON 或 markdown

依問題類型回答：
- 客戶只說「你好」時，回覆：您好，很高興為您服務！請問今天想了解網站開發、AI 客服、LINE 官方帳號整合，還是其他服務呢？
- 客戶問「你們有什麼服務？」時：先說明 AXORA 主要協助企業打造數位化解決方案，包含企業官網、AI 客服、LINE 官方帳號整合、CRM 客戶管理、客製化系統及流程自動化等服務；最後加一句：請問您目前比較想了解網站、AI 客服，還是企業管理系統呢？
- 客戶詢問價格：不要直接報價。先了解公司產業、需求、功能、預算，再說我們會依需求提供合適的方案與報價。
- 客戶詢問是否可以做某功能：先回答「可以」，再簡單說明我們的做法，最後詢問是否需要安排顧問協助。
- 客戶需求不明確時，詢問網站、AI、CRM 或系統開發等需求。

客戶訊息：
${trimmed}`,
      },
    ],
    temperature: 0.5,
  });
  console.log("[line-webhook] openAiChatCompletion result", {
    ok: aiCall.ok,
    error: aiCall.ok === false ? aiCall.error : null,
    content: aiCall.ok === false ? null : aiCall.result.content,
  });

  if (aiCall.ok === false) {
    console.error("[line-webhook] OpenAI reply failed:", aiCall.error);
    return null;
  }

  const content = aiCall.result.content?.trim();
  if (!content) {
    console.error("[line-webhook] OpenAI reply empty");
    return null;
  }

  const sanitized = sanitizeCustomerFacingLineReply(content).trim();
  return sanitized || null;
}

async function sendLineWebhookReply(
  replyToken: string,
  message: string,
  channelAccessToken: string,
  reason: string,
): Promise<void> {
  const result = await sendLineReplyMessage(replyToken, message, channelAccessToken);
  console.log("[line-webhook] LINE reply result", {
    reason,
    ok: result.ok,
    status: result.status,
    error: result.error ?? null,
  });
  console.log("[line-webhook] reply result", {
    reason,
    ok: result.ok,
    status: result.status,
    error: result.error ?? null,
  });
}

async function handleTextMessage(
  event: LineWebhookEvent,
  channelAccessToken: string,
  supabase: SupabaseClient,
): Promise<void> {
  const messageText = event.message?.text ?? null;
  const replyToken = event.replyToken?.trim();
  console.log("[line-webhook] handleTextMessage start", {
    messageText,
    hasReplyToken: Boolean(replyToken),
  });
  const command = parseBindCommand(messageText);

  console.log("[line-webhook] handleTextMessage", {
    messageText,
    hasReplyToken: Boolean(replyToken),
    isBindCommand: Boolean(command),
    bindCustomerName: command?.customerName ?? null,
  });

  if (!replyToken) {
    console.log("[line-webhook] skip reply: missing replyToken");
    return;
  }

  if (!command) {
    const inboundText = messageText?.trim() ?? "";
    if (!inboundText) {
      console.log("[line-webhook] skip reply: empty message text");
      return;
    }

    const lineUserId = event.source?.userId?.trim();
    const companyId = lineUserId
      ? await resolveCompanyForLineUser(supabase, lineUserId)
      : null;
    const aiCompanyId = companyId ?? 55;

    console.log("[line-webhook] generating AI reply", {
      messageText: inboundText,
      companyId: aiCompanyId,
    });

    console.log("[line-webhook] calling OpenAI", {
      messageText: inboundText,
      companyId: aiCompanyId,
    });

    const aiReply = await generateLineAiReply(inboundText, aiCompanyId);
    console.log("[line-webhook] sending LINE reply", {
      hasReplyToken: Boolean(replyToken),
      replyText: aiReply ?? AI_REPLY_UNAVAILABLE,
    });
    await sendLineWebhookReply(
      replyToken,
      aiReply ?? AI_REPLY_UNAVAILABLE,
      channelAccessToken,
      aiReply ? "ai_reply" : "ai_reply_failed",
    );
    return;
  }

  const lineUserId = event.source?.userId?.trim();
  if (!lineUserId) {
    console.log("[line-webhook] skip reply: missing lineUserId");
    return;
  }

  const companyId = await resolveCompanyForLineUser(supabase, lineUserId);
  if (companyId == null) {
    await sendLineWebhookReply(replyToken, BIND_NAME_REQUIRED_REPLY, channelAccessToken, "bind_missing_company");
    return;
  }
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
      await sendLineWebhookReply(replyToken, CUSTOMER_NOT_FOUND_REPLY, channelAccessToken, "bind_customer_not_found");
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
      await sendLineWebhookReply(replyToken, BIND_FAILED_REPLY, channelAccessToken, "bind_manual_failed");
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

    await sendLineWebhookReply(replyToken, BIND_NAME_REQUIRED_REPLY, channelAccessToken, "bind_name_required");
  } catch (err) {
    console.error("[line-webhook] bare bind failed:", err);
    await sendLineWebhookReply(replyToken, BIND_FAILED_REPLY, channelAccessToken, "bind_bare_failed");
  }
}

export async function POST(req: Request) {
  console.log("[line-webhook] POST start");
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  if (!channelSecret) {
    serverLogger.warn({
      eventType: "webhook.failure",
      status: "warn",
      message: "line_missing_channel_secret",
    });
    return NextResponse.json(
      { ok: false, error: "LINE_CHANNEL_SECRET is not configured" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("x-line-signature");
  if (!signature?.trim()) {
    serverLogger.warn({
      eventType: "webhook.failure",
      status: "warn",
      message: "line_missing_signature_header",
    });
    return NextResponse.json({ ok: false, error: "missing x-line-signature" }, { status: 400 });
  }

  const rawBodyBuffer = Buffer.from(await req.arrayBuffer());
  if (!verifyLineWebhookSignature(rawBodyBuffer, signature)) {
    serverLogger.warn({
      eventType: "webhook.failure",
      status: "warn",
      message: "line_invalid_signature",
    });
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  const rawBody = rawBodyBuffer.toString("utf8");

  let body: LineWebhookBody = {};
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch (err) {
    serverLogger.error(
      {
        eventType: "webhook.failure",
        status: "error",
        message: "line_invalid_json_body",
      },
      err,
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const events = body.events ?? [];
  const textEvents = events.filter(isTextMessageEvent);
  console.log("[line-webhook] parsed events", {
    totalEvents: events.length,
    textEvents: textEvents.length,
  });
  console.log("[line-webhook] events received", {
    totalEvents: events.length,
    textEvents: textEvents.length,
    messages: textEvents.map((event) => ({
      text: event.message?.text ?? null,
      hasReplyToken: Boolean(event.replyToken?.trim()),
    })),
  });
  serverLogger.info({
    eventType: "payment.callback",
    status: "ok",
    message: "line_webhook_received",
    meta: { totalEvents: events.length, textEvents: textEvents.length },
  });

  if (textEvents.length === 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const supabase = getSupabaseServer();
  const channelAccessToken = await resolveChannelAccessToken();
  console.log("[line-webhook] channel access token", {
    present: Boolean(channelAccessToken),
  });

  try {
    if (channelAccessToken) {
      await logInboundEvents(supabase, textEvents, channelAccessToken);
    } else {
      serverLogger.warn({
        eventType: "webhook.failure",
        status: "warn",
        message: "line_missing_channel_access_token_inbound",
      });
    }
  } catch (err) {
    serverLogger.error(
      {
        eventType: "webhook.failure",
        status: "error",
        message: "line_log_inbound_failed",
      },
      err,
    );
  }

  try {
    if (channelAccessToken) {
      await Promise.all(
        textEvents.map((event) => handleTextMessage(event, channelAccessToken, supabase)),
      );
    } else {
      serverLogger.warn({
        eventType: "webhook.failure",
        status: "warn",
        message: "line_missing_channel_access_token_reply",
      });
    }
  } catch (err) {
    serverLogger.error(
      {
        eventType: "webhook.failure",
        status: "error",
        message: "line_handle_text_failed",
      },
      err,
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "method not allowed" }, { status: 405 });
}
