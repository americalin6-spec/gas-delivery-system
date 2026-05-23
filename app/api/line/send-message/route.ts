import { NextResponse } from "next/server";
import { findCustomerIdForLineUser } from "../../../lib/conversationsServer";
import { runCustomerAiFieldExtraction } from "../../../lib/customerAiExtractServer";
import { getServerCompanyId } from "../../../lib/companyContext";
import { sendLinePushMessage } from "../../../lib/lineMessaging";
import { getSupabaseServer } from "../../../lib/supabaseServer";

type SendMessageBody = {
  customer_id?: string | null;
  line_user_id?: string | null;
  message?: string | null;
};

/** Push a text message to a bound LINE user via Messaging API, then log outbound conversation. */
export async function POST(req: Request) {
  const companyId = getServerCompanyId(req);

  let body: SendMessageBody = {};
  try {
    body = (await req.json()) as SendMessageBody;
  } catch (err) {
    console.error("[line/send-message] invalid JSON:", err);
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const customerId = body.customer_id?.toString().trim() ?? "";
  const lineUserId = body.line_user_id?.toString().trim() ?? "";
  const message = body.message?.toString().trim() ?? "";

  if (!customerId) {
    return NextResponse.json({ ok: false, error: "customer_id is required" }, { status: 400 });
  }
  if (!lineUserId) {
    return NextResponse.json({ ok: false, error: "line_user_id is required" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
  }

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? "";
  if (!channelAccessToken) {
    return NextResponse.json(
      { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN is not configured" },
      { status: 503 },
    );
  }

  const supabase = getSupabaseServer();

  const boundCustomerId = await findCustomerIdForLineUser(supabase, lineUserId, companyId);
  if (!boundCustomerId || boundCustomerId !== customerId) {
    return NextResponse.json(
      { ok: false, error: "line_user_id is not bound to this customer" },
      { status: 400 },
    );
  }

  const pushResult = await sendLinePushMessage(message, channelAccessToken, lineUserId);
  if (!pushResult.ok) {
    console.error("[line/send-message] LINE API push failed:", {
      customerId,
      lineUserId,
      companyId,
      status: pushResult.status,
      error: pushResult.error,
    });
    return NextResponse.json(
      { ok: false, error: pushResult.error ?? "LINE push failed" },
      { status: 502 },
    );
  }

  const nowIso = new Date().toISOString();
  const conversationPayload = {
    customer_id: customerId,
    line_user_id: lineUserId,
    message_text: message,
    direction: "outbound",
    company_id: companyId,
    created_at: nowIso,
  };

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert(conversationPayload)
    .select("id")
    .maybeSingle();

  if (convError) {
    console.error("[line/send-message] conversation insert failed after LINE push:", {
      message: convError.message,
      details: convError.details,
      code: convError.code,
      payload: conversationPayload,
    });
    return NextResponse.json(
      {
        ok: false,
        error: `Message was sent to LINE but timeline log failed: ${convError.message}`,
        lineSent: true,
      },
      { status: 500 },
    );
  }

  const { error: customerError } = await supabase
    .from("customers")
    .update({ last_contacted_at: nowIso })
    .eq("company_id", companyId)
    .eq("id", customerId);

  if (customerError) {
    console.warn("[line/send-message] last_contacted_at update failed:", customerError.message);
  }

  try {
    await runCustomerAiFieldExtraction(supabase, companyId, customerId, {
      conversationText: message,
      trigger: "line.send-message",
    });
  } catch (extractErr) {
    console.error("[line/send-message] ai extract failed:", extractErr);
  }

  console.log("[line/send-message] success:", {
    customerId,
    lineUserId,
    companyId,
    conversationId: conversation?.id ?? null,
  });

  return NextResponse.json({
    ok: true,
    conversationId: conversation?.id ?? null,
  });
}
