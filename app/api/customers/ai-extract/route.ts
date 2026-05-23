import { NextResponse } from "next/server";
import { getServerCompanyId } from "../../../lib/companyContext";
import { runCustomerAiFieldExtraction } from "../../../lib/customerAiExtractServer";
import { getSupabaseServer } from "../../../lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const companyId = getServerCompanyId(req);
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

    const supabase = getSupabaseServer();
    const extract = await runCustomerAiFieldExtraction(supabase, companyId, customerId, {
      conversationText: body.conversation_text,
      trigger: "api.ai-extract",
    });

    if (!extract.ok) {
      return NextResponse.json(
        { ok: false, error: extract.error ?? "擷取失敗" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, extract });
  } catch (err) {
    console.error("[ai-extract]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "擷取失敗" },
      { status: 500 },
    );
  }
}
