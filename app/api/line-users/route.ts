import { NextResponse } from "next/server";
import { getServerCompanyId } from "../../lib/companyContext";
import { syncCustomerPrimaryLineUserId } from "../../lib/lineCustomerBinding";
import {
  fetchLineUsersForCustomer,
  resolveCustomerLineUserId,
} from "../../lib/lineUsersServer";
import { getSupabaseServer } from "../../lib/supabaseServer";

/** List all LINE user bindings for a CRM customer (service role; no row cap at 1). */
export async function GET(req: Request) {
  const companyId = getServerCompanyId(req);
  const params = new URL(req.url).searchParams;
  const customerId = params.get("customer_id")?.trim() ?? "";
  const primaryLineUserId = params.get("primary_line_user_id")?.trim() || null;

  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "customer_id is required", rows: [] },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer();
  const sync = await syncCustomerPrimaryLineUserId(supabase, customerId, companyId);
  const resolvedLineUserId =
    primaryLineUserId ?? sync.lineUserId ?? (await resolveCustomerLineUserId(supabase, customerId));

  const { rows, error } = await fetchLineUsersForCustomer(supabase, customerId, companyId, {
    primaryLineUserId: resolvedLineUserId,
    skipSync: true,
  });

  if (error) {
    console.error("[line-users] GET failed:", {
      customerId,
      companyId,
      primaryLineUserId,
      error,
    });
    return NextResponse.json({ ok: false, error, rows: [], count: 0 }, { status: 500 });
  }

  console.log("[line-users] GET ok:", {
    customerId,
    companyId,
    primaryLineUserId: resolvedLineUserId,
    count: rows.length,
    lineUserIds: rows.map((r) => r.line_user_id),
    customerIdsOnRows: rows.map((r) => r.customer_id),
  });

  return NextResponse.json({
    ok: true,
    rows,
    count: rows.length,
  });
}
