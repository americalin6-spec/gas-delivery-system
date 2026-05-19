import { NextResponse } from "next/server";
import { getSupabaseServer } from "../../lib/supabaseServer";

const CONVERSATIONS_SELECT =
  "id, customer_id, line_user_id, message_text, direction, created_at";

/** Fetch CRM conversation history for a customer. Server-side reads bypass anon RLS. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get("customer_id")?.trim() ?? "";

  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "customer_id is required", rows: [] },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATIONS_SELECT)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[conversations] GET error:", {
      customerId,
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
    rowCount: rows.length,
    firstId: rows[0] && "id" in rows[0] ? rows[0].id : null,
  });

  return NextResponse.json({ ok: true, rows });
}

/**
 * Delete conversations.
 * - `?id=...` removes a single row.
 * - `?customer_id=...&all=1` removes every conversation for the customer.
 */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  const customerId = url.searchParams.get("customer_id")?.trim() ?? "";
  const all = url.searchParams.get("all") === "1";

  if (!id && !(customerId && all)) {
    return NextResponse.json(
      { ok: false, error: "id or (customer_id + all=1) is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer();
  let query = supabase.from("conversations").delete();
  if (id) {
    query = query.eq("id", id);
  } else {
    query = query.eq("customer_id", customerId);
  }

  const { data, error } = await query.select("id");

  if (error) {
    console.error("[conversations] DELETE error:", {
      id,
      customerId,
      all,
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

  const deletedCount = data?.length ?? 0;
  console.log("[conversations] DELETE ok:", { id, customerId, all, deletedCount });

  return NextResponse.json({ ok: true, deletedCount });
}
