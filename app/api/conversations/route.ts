import { NextResponse } from "next/server";
import { findLineUserIdForCustomer } from "../../lib/conversationsServer";
import { runCustomerAiFieldExtraction } from "../../lib/customerAiExtractServer";
import { requireApiAuth } from "../../lib/apiAuth";

const CONVERSATIONS_SELECT =
  "id, customer_id, line_user_id, message_text, direction, created_at, company_id";

type ConversationInsertBody = {
  customer_id?: string | null;
  message_text?: string | null;
  line_user_id?: string | null;
  direction?: "inbound" | "outbound" | string | null;
};

/** Insert a conversation row (typically outbound messages sent/copied from CRM). */
export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const { supabase, companyId } = auth;
  let body: ConversationInsertBody = {};
  try {
    body = (await req.json()) as ConversationInsertBody;
  } catch (err) {
    console.error("[conversations] POST invalid JSON:", err);
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const customerId = body.customer_id?.toString().trim() ?? "";
  const messageText = body.message_text?.toString() ?? "";

  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "customer_id is required" },
      { status: 400 },
    );
  }
  if (!messageText.trim()) {
    return NextResponse.json(
      { ok: false, error: "message_text is required" },
      { status: 400 },
    );
  }

  const direction = body.direction?.toString().trim() === "inbound" ? "inbound" : "outbound";

  let lineUserId = body.line_user_id?.toString().trim() ?? "";
  if (!lineUserId) {
    lineUserId = (await findLineUserIdForCustomer(supabase, customerId, companyId)) ?? "";
  }

  const payload: Record<string, unknown> = {
    customer_id: customerId,
    message_text: messageText,
    direction,
    line_user_id: lineUserId || `crm-paste:${customerId}`,
    company_id: companyId,
    created_at: new Date().toISOString(),
  };

  console.log("[CONVERSATION_SAVE_START]", {
    customerId,
    companyId,
    direction,
    messageLength: messageText.length,
  });

  const { data, error } = await supabase
    .from("conversations")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[CONVERSATION_SAVE_FAILED]", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      payload,
    });
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  console.log("[CONVERSATION_SAVE_SUCCESS]", {
    id: data?.id ?? null,
    customerId,
    direction,
    lineUserId: lineUserId || null,
    companyId,
    message_length: messageText.length,
  });

  let extract = null;
  try {
    extract = await runCustomerAiFieldExtraction(supabase, companyId, customerId, {
      conversationText: messageText,
      trigger: "conversations.post",
    });
  } catch (extractErr) {
    console.error("[conversations] ai extract failed:", extractErr);
  }

  return NextResponse.json({ ok: true, id: data?.id ?? null, extract });
}

/** Fetch CRM conversation history for a customer (RLS-scoped). */
export async function GET(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const { supabase, companyId } = auth;
  const url = new URL(req.url);
  const customerId = url.searchParams.get("customer_id")?.trim() ?? "";
  const lineUserId = url.searchParams.get("line_user_id")?.trim() ?? "";

  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "customer_id is required", rows: [] },
      { status: 400 },
    );
  }

  let query = supabase
    .from("conversations")
    .select(CONVERSATIONS_SELECT)
    .eq("customer_id", customerId)
    .eq("company_id", companyId);

  if (lineUserId) {
    query = query.eq("line_user_id", lineUserId);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    console.error("[conversations] GET error:", {
      customerId,
      companyId,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return NextResponse.json(
      { ok: false, error: error.message, rows: [] },
      { status: 500 },
    );
  }

  const rows = data ?? [];
  console.log("[conversations] GET ok:", {
    customerId,
    lineUserId: lineUserId || null,
    companyId,
    rowCount: rows.length,
    firstId: rows[0] && "id" in rows[0] ? rows[0].id : null,
  });

  return NextResponse.json({ ok: true, rows });
}

function parseDeleteIds(url: URL): string[] {
  const raw = url.searchParams.get("ids")?.trim() ?? "";
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return url.searchParams
    .getAll("ids")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Delete conversations.
 * - `?ids=id1,id2` — delete by row id(s) from loaded messages (preferred).
 * - `?id=...` — single row.
 * - `?customer_id=...&all=1` — fallback when ids not provided.
 */
export async function DELETE(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const { supabase, companyId } = auth;
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  const customerId = url.searchParams.get("customer_id")?.trim() ?? "";
  const all = url.searchParams.get("all") === "1";
  const ids = parseDeleteIds(url);

  console.log("[conversations] DELETE /api/conversations received:", {
    receivedCustomerId: customerId || null,
    receivedCompanyId: companyId,
    receivedIds: ids,
    all,
    singleRowId: id || null,
    companyHeader: req.headers.get("x-company-id"),
  });

  if (ids.length === 0 && !id && !(customerId && all)) {
    console.warn("[conversations] DELETE rejected: missing ids, id, or customer_id+all");
    return NextResponse.json(
      { ok: false, error: "ids, id, or (customer_id + all=1) is required", deletedCount: 0 },
      { status: 400 },
    );
  }

  if (ids.length > 0) {
    const { error, count } = await supabase
      .from("conversations")
      .delete({ count: "exact" })
      .in("id", ids);

    if (error) {
      console.error("[conversations] DELETE by ids error:", {
        receivedIds: ids,
        receivedCompanyId: companyId,
        deletedCount: 0,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return NextResponse.json(
        { ok: false, error: error.message, deletedCount: 0 },
        { status: 500 },
      );
    }

    const deletedCount = count ?? 0;
    console.log("[conversations] DELETE by ids ok:", {
      receivedIds: ids,
      receivedCompanyId: companyId,
      deletedCount,
    });

    return NextResponse.json({ ok: true, deletedCount });
  }

  if (customerId && all) {
    const { data: rows, error: listError } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", customerId)
      .eq("company_id", companyId);

    if (listError) {
      console.error("[conversations] DELETE list error:", {
        receivedCustomerId: customerId,
        receivedCompanyId: companyId,
        message: listError.message,
        details: listError.details,
        hint: listError.hint,
        code: listError.code,
      });
      return NextResponse.json(
        { ok: false, error: listError.message, deletedCount: 0 },
        { status: 500 },
      );
    }

    const ids = (rows ?? []).map((row) => row.id);
    console.log("[conversations] DELETE rows matched (GET filter):", {
      receivedCustomerId: customerId,
      receivedCompanyId: companyId,
      matchCount: ids.length,
      ids,
    });

    let deletedCount = 0;
    if (ids.length > 0) {
      const { error, count } = await supabase
        .from("conversations")
        .delete({ count: "exact" })
        .in("id", ids);

      if (error) {
        console.error("[conversations] DELETE error:", {
          receivedCustomerId: customerId,
          receivedCompanyId: companyId,
          all,
          matchCount: ids.length,
          deletedCount: 0,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return NextResponse.json(
          { ok: false, error: error.message, deletedCount: 0 },
          { status: 500 },
        );
      }

      deletedCount = count ?? 0;
    }

    console.log("[conversations] DELETE ok:", {
      receivedCustomerId: customerId,
      receivedCompanyId: companyId,
      all,
      matchCount: ids.length,
      deletedCount,
    });

    return NextResponse.json({ ok: true, deletedCount });
  }

  const { error, count } = await supabase
    .from("conversations")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("[conversations] DELETE error:", {
      singleRowId: id,
      receivedCompanyId: companyId,
      deletedCount: 0,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return NextResponse.json(
      { ok: false, error: error.message, deletedCount: 0 },
      { status: 500 },
    );
  }

  const deletedCount = count ?? 0;
  console.log("[conversations] DELETE ok:", {
    singleRowId: id,
    receivedCompanyId: companyId,
    deletedCount,
  });

  return NextResponse.json({ ok: true, deletedCount });
}
