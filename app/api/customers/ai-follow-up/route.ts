import { NextResponse } from "next/server";
import {
  analyzeConversationEngagement,
  buildCustomerAiContextBlock,
  formatConversationRows,
  type ConversationRow,
} from "../../../lib/customerAiContext";
import {
  buildCustomerAiFollowUpPrompt,
  buildFallbackCustomerAiFollowUp,
  parseCustomerAiFollowUp,
} from "../../../lib/customerAiFollowUp";
import { parseAiJsonObject } from "../../../lib/parseAiJson";
import { fetchCustomerByIdForActiveCompany } from "../../../lib/customersTenant";
import { requireApiAuth } from "../../../lib/apiAuth";
import { API_ACCESS_DENIED } from "../../../lib/apiTenant";
import { openAiChatCompletion } from "../../../lib/aiUsageServer";
import { runCustomerAiFieldExtraction } from "../../../lib/customerAiExtractServer";
import { persistCustomerAiFollowUpFields } from "../../../lib/customerAiPersistence";

const CONVERSATIONS_SELECT =
  "id, customer_id, message_text, direction, created_at";

export async function POST(req: Request) {
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
    let engagementRows: ConversationRow[] = [];

    const { data: rows, error: convError } = await supabase
      .from("conversations")
      .select(CONVERSATIONS_SELECT)
      .eq("customer_id", customerId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (convError) {
      console.error("[ai-follow-up] conversations error:", convError.message);
    } else {
      engagementRows = (rows ?? []) as ConversationRow[];
      if (!conversationText) {
        conversationText = formatConversationRows(engagementRows);
      }
    }

    const engagement = analyzeConversationEngagement(engagementRows);
    const context = buildCustomerAiContextBlock(customer, conversationText, engagement);
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    const runExtract = async () => {
      try {
        return await runCustomerAiFieldExtraction(supabase, companyId, customerId, {
          conversationText,
          trigger: "ai-follow-up",
          userId: user.id,
        });
      } catch (extractErr) {
        console.error("[ai-follow-up] extract failed:", extractErr);
        return null;
      }
    };

    if (!apiKey) {
      const followUp = buildFallbackCustomerAiFollowUp(customer, engagement);
      const extract = await runExtract();
      return NextResponse.json({ ok: true, followUp, source: "crm_fallback", extract });
    }

    const aiCall = await openAiChatCompletion({
      companyId,
      userId: user.id,
      feature: "ai_follow_up",
      messages: [
        { role: "user", content: buildCustomerAiFollowUpPrompt(context, engagement) },
      ],
      temperature: 0.4,
    });

    if (aiCall.ok === false) {
      return NextResponse.json(
        { ok: false, error: aiCall.error },
        { status: aiCall.status },
      );
    }

    const content = aiCall.result.content;
    const parsed = parseAiJsonObject(content);

    if (!parsed) {
      console.error("[ai-follow-up] invalid AI JSON", {
        preview: typeof content === "string" ? content.slice(0, 300) : content,
      });
      const followUp = buildFallbackCustomerAiFollowUp(customer, engagement);
      const extract = await runExtract();
      return NextResponse.json({ ok: true, followUp, source: "crm_fallback", extract });
    }

    const followUp = parseCustomerAiFollowUp(parsed, customer, engagement);
    const saved = await persistCustomerAiFollowUpFields(
      supabase,
      companyId,
      customerId,
      followUp,
    );
    console.log("[analyze-save]", {
      source: "ai-follow-up",
      customerId,
      companyId,
      savedColumns: saved.savedColumns,
      error: saved.error,
    });
    const extract = await runExtract();
    return NextResponse.json({ ok: true, followUp, source: "ai", extract });
  } catch (err) {
    console.error("[ai-follow-up]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "AI 跟進分析失敗" },
      { status: 500 },
    );
  }
}
