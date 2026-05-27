import { NextResponse } from "next/server";
import { requireApiAuth } from "../../lib/apiAuth";
import { requireCustomerInCompany } from "../../lib/apiTenant";
import { syncCustomerPrimaryLineUserId } from "../../lib/lineCustomerBinding";
import {
  fetchLineUsersForCustomer,
  resolveCustomerLineUserId,
  type FetchLineUsersDebug,
} from "../../lib/lineUsersServer";

/** List LINE bindings for a CRM customer (authenticated + RLS). */
export async function GET(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const { supabase, companyId } = auth;
  const authKeyKind = "authenticated" as const;
  const params = new URL(req.url).searchParams;
  const customerId = params.get("customer_id")?.trim() ?? "";
  const primaryLineUserId = params.get("primary_line_user_id")?.trim() || null;

  console.log("[line-users] GET request:", {
    customer_id: customerId,
    companyId,
    primary_line_user_id: primaryLineUserId,
    headerCompanyId: req.headers.get("x-company-id"),
    authKeyKind: "authenticated",
  });

  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "customer_id is required", rows: [], count: 0 },
      { status: 400 },
    );
  }

  const denied = await requireCustomerInCompany(supabase, customerId, companyId);
  if (denied) {
    return denied;
  }

  const debug: FetchLineUsersDebug = {
    customerIdInput: customerId,
    companyId,
    matchCandidates: [],
    authKeyKind: "authenticated",
    queries: [],
    tableProbeCount: 0,
    finalReturnedRows: 0,
  };

  const sync = await syncCustomerPrimaryLineUserId(supabase, customerId, companyId);
  console.log("[line-users] syncCustomerPrimaryLineUserId:", sync);

  const resolvedLineUserId =
    primaryLineUserId ??
    sync.lineUserId ??
    (await resolveCustomerLineUserId(supabase, customerId, companyId));

  const { rows, error } = await fetchLineUsersForCustomer(supabase, customerId, companyId, {
    primaryLineUserId: resolvedLineUserId,
    skipSync: true,
    debug,
  });

  const payload = rows.map((r) => ({
    line_user_id: r.line_user_id,
    display_name: r.display_name,
    created_at: r.created_at,
    customer_id: r.customer_id,
  }));

  if (error) {
    console.error("[line-users] GET failed:", {
      customerId,
      companyId,
      primaryLineUserId: resolvedLineUserId,
      error,
      debug,
      rawReturnedRows: payload,
    });
    return NextResponse.json(
      { ok: false, error, rows: [], count: 0, debug, authKeyKind },
      { status: 500 },
    );
  }

  console.log("[line-users] GET ok:", {
    customerId,
    companyId,
    primaryLineUserId: resolvedLineUserId,
    authKeyKind,
    count: payload.length,
    lineUserIds: payload.map((r) => r.line_user_id),
    customerIdsOnRows: payload.map((r) => r.customer_id),
    debug,
  });

  return NextResponse.json({
    ok: true,
    rows: payload,
    count: payload.length,
    companyId,
    customerId,
    authKeyKind,
  });
}
