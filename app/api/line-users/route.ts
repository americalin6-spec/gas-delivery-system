import { NextResponse } from "next/server";
import { getServerCompanyId } from "../../lib/companyContext";
import { syncCustomerPrimaryLineUserId } from "../../lib/lineCustomerBinding";
import {
  fetchLineUsersForCustomer,
  resolveCustomerLineUserId,
  type FetchLineUsersDebug,
} from "../../lib/lineUsersServer";
import {
  createServerClient,
  getSupabaseServerAuthKind,
  isServiceRoleConfigured,
} from "../../lib/supabaseServer";

/** List LINE bindings for a CRM customer (service role only — bypasses RLS). */
export async function GET(req: Request) {
  const companyId = getServerCompanyId(req);
  const params = new URL(req.url).searchParams;
  const customerId = params.get("customer_id")?.trim() ?? "";
  const primaryLineUserId = params.get("primary_line_user_id")?.trim() || null;

  const authKeyKind = getSupabaseServerAuthKind();

  console.log("[line-users] GET request:", {
    customer_id: customerId,
    companyId,
    primary_line_user_id: primaryLineUserId,
    headerCompanyId: req.headers.get("x-company-id"),
    authKeyKind,
    serviceRoleConfigured: isServiceRoleConfigured(),
  });

  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "customer_id is required", rows: [], count: 0 },
      { status: 400 },
    );
  }

  if (!isServiceRoleConfigured()) {
    const msg =
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Server cannot read line_users (RLS blocks anon key).";
    console.error("[line-users] GET blocked:", msg);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        rows: [],
        count: 0,
        authKeyKind,
      },
      { status: 503 },
    );
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[line-users] createServerClient failed:", msg);
    return NextResponse.json(
      { ok: false, error: msg, rows: [], count: 0, authKeyKind },
      { status: 503 },
    );
  }

  const debug: FetchLineUsersDebug = {
    customerIdInput: customerId,
    companyId,
    matchCandidates: [],
    authKeyKind: "service_role",
    queries: [],
    tableProbeCount: 0,
    finalReturnedRows: 0,
  };

  const sync = await syncCustomerPrimaryLineUserId(supabase, customerId, companyId);
  console.log("[line-users] syncCustomerPrimaryLineUserId:", sync);

  const resolvedLineUserId =
    primaryLineUserId ?? sync.lineUserId ?? (await resolveCustomerLineUserId(supabase, customerId));

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
