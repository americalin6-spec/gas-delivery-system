import { NextResponse } from "next/server";
import { getServerCompanyId } from "../../lib/companyContext";
import { fetchLineUsersForCustomer } from "../../lib/lineUsersServer";
import { getSupabaseServer } from "../../lib/supabaseServer";

/** List all LINE user bindings for a CRM customer (service role; no row cap at 1). */
export async function GET(req: Request) {
  const companyId = getServerCompanyId(req);
  const customerId = new URL(req.url).searchParams.get("customer_id")?.trim() ?? "";

  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "customer_id is required", rows: [] },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer();
  const { rows, error } = await fetchLineUsersForCustomer(supabase, customerId, companyId);

  if (error) {
    console.error("[line-users] GET failed:", { customerId, companyId, error });
    return NextResponse.json({ ok: false, error, rows: [], count: 0 }, { status: 500 });
  }

  console.log("[line-users] GET ok:", {
    customerId,
    companyId,
    count: rows.length,
    lineUserIds: rows.map((r) => r.line_user_id),
  });

  return NextResponse.json({
    ok: true,
    rows,
    count: rows.length,
  });
}
