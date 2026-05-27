import { NextResponse } from "next/server";
import {
  buildCustomerAiSummaryContext,
  buildCustomerAiSummaryPrompt,
  buildFallbackCustomerAiSummary,
  parseCustomerAiSummary,
} from "../../../lib/customerAiSummary";
import { parseAiJsonObject } from "../../../lib/parseAiJson";
import { fetchCustomerByIdForActiveCompany } from "../../../lib/customersTenant";
import { requireApiAuth } from "../../../lib/apiAuth";
import { API_ACCESS_DENIED } from "../../../lib/apiTenant";
import {
  finalizeAiUsageSuccess,
  openAiChatCompletion,
  releaseAiQuotaReservation,
} from "../../../lib/aiUsageServer";
import { runCustomerAiFieldExtraction } from "../../../lib/customerAiExtractServer";
import { persistCustomerAiSummaryFields } from "../../../lib/customerAiPersistence";

const CONVERSATIONS_SELECT =
  "id, customer_id, message_text, direction, created_at";

export async function POST(req: Request) {
  let heldReservation:
    | import("../../../lib/aiUsageServer").AiQuotaReservation
    | null = null;
  try {
    const auth = await requireApiAuth(req);
    if (auth instanceof NextResponse) {
      return auth;
    }
    const { supabase, companyId, user } = auth;
    let body: { customer_id?: string; conversation_text?: string } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const customerId = body.customer_id?.toString().trim() ?? "";
    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "customer_id is required" },
        { status: 400 },
      );
    }

    const { customer, error: fetchError } = await fetchCustomerByIdForActiveCompany<
      Record<string, unknown>
    >(supabase, customerId, companyId);

    if (fetchError) {
      return NextResponse.json(
        { ok: false, error: fetchError.message },
        { status: 500 },
      );
    }
    if (!customer) {
      return NextResponse.json({ ok: false, error: API_ACCESS_DENIED }, { status: 403 });
    }

    let conversationText = body.conversation_text?.trim() ?? "";
    if (!conversationText) {
      const { data: rows, error: convError } = await supabase
        .from("conversations")
        .select(CONVERSATIONS_SELECT)
        .eq("customer_id", customerId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });

      if (convError) {
        console.error("[ai-summary] conversations error:", convError.message);
      } else {
        conversationText = (rows ?? [])
          .map((row) => {
            const r = row as { direction?: string; message_text?: string };
            const dir = r.direction === "outbound" ? "我方" : "客戶";
            const msg = String(r.message_text ?? "").trim();
            return msg ? `${dir}：${msg}` : "";
          })
          .filter(Boolean)
          .join("\n");
      }
    }

    const context = buildCustomerAiSummaryContext(customer, conversationText);
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    let extract = null;
    const runExtract = async () => {
      try {
        return await runCustomerAiFieldExtraction(supabase, companyId, customerId, {
          conversationText,
          trigger: "ai-summary",
          userId: user.id,
        });
      } catch (extractErr) {
        console.error("[ai-summary] extract failed:", extractErr);
        return null;
      }
    };

    if (!apiKey) {
      const summary = buildFallbackCustomerAiSummary(customer);
      extract = await runExtract();
      return NextResponse.json({ ok: true, summary, source: "crm_fallback", extract });
    }

    const aiCall = await openAiChatCompletion({
      companyId,
      userId: user.id,
      feature: "ai_summary",
      messages: [{ role: "user", content: buildCustomerAiSummaryPrompt(context) }],
      temperature: 0.35,
    });

    if (aiCall.ok === false) {
      return NextResponse.json(
        { ok: false, error: aiCall.error },
        { status: aiCall.status },
      );
    }
    heldReservation = aiCall.result.reservation;

    const content = aiCall.result.content;
    const parsed = parseAiJsonObject(content);

    if (!parsed) {
      await releaseAiQuotaReservation(aiCall.result.reservation);
      heldReservation = null;
      console.error("[ai-summary] invalid AI JSON", {
        preview: typeof content === "string" ? content.slice(0, 300) : content,
      });
      const summary = buildFallbackCustomerAiSummary(customer);
      extract = await runExtract();
      return NextResponse.json({ ok: true, summary, source: "crm_fallback", extract });
    }

    const summary = parseCustomerAiSummary(parsed, customer);
    const saved = await persistCustomerAiSummaryFields(
      supabase,
      companyId,
      customerId,
      summary,
    );
    if (saved.error || saved.savedColumns.length === 0) {
      await releaseAiQuotaReservation(aiCall.result.reservation);
      heldReservation = null;
    } else {
      await finalizeAiUsageSuccess({
        reservation: aiCall.result.reservation,
        companyId,
        userId: user.id,
        feature: "ai_summary",
        estimatedTokens: aiCall.result.estimatedTokens,
      });
      heldReservation = null;
    }
    console.log("[analyze-save]", {
      source: "ai-summary",
      customerId,
      companyId,
      savedColumns: saved.savedColumns,
      error: saved.error,
    });
    extract = await runExtract();
    return NextResponse.json({ ok: true, summary, source: "ai", extract });
  } catch (err) {
    if (heldReservation) {
      await releaseAiQuotaReservation(heldReservation);
    }
    console.error("[ai-summary]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "AI 分析失敗" },
      { status: 500 },
    );
  }
}
