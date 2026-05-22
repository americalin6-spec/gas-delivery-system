import { NextResponse } from "next/server";
import { getServerCompanyId } from "../../lib/companyContext";
import { activeCustomersOnly } from "../../lib/customerSoftDelete";
import {
  fetchCustomersForCompanyList,
  logCustomerListStats,
} from "../../lib/customersListServer";
import { getSupabaseServer } from "../../lib/supabaseServer";

/**
 * CRM customer list (service role when configured — bypasses restrictive RLS).
 * Tenant scope: company_id = active header OR NULL (orphans backfilled on read).
 */
export async function GET(req: Request) {
  const companyId = getServerCompanyId(req);
  const trash =
    new URL(req.url).searchParams.get("trash") === "1" ||
    new URL(req.url).searchParams.get("trash") === "true";

  const supabase = getSupabaseServer();

  const [{ count: tableTotal }, { count: tableActive }] = await Promise.all([
    supabase.from("customers").select("id", { count: "exact", head: true }),
    activeCustomersOnly(supabase.from("customers").select("id", { count: "exact", head: true })),
  ]);

  console.log("[api/customers] table diagnostics:", {
    activeCompanyId: companyId,
    trash,
    customersTableTotal: tableTotal ?? null,
    customersTableActiveNotDeleted: tableActive ?? null,
  });

  const result = await fetchCustomersForCompanyList(supabase, companyId, { trash });

  if (result.error) {
    console.error("[api/customers] GET failed:", {
      companyId,
      trash,
      error: result.error,
    });
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        rows: [],
        fetchedCount: 0,
        companyId,
      },
      { status: 500 },
    );
  }

  logCustomerListStats("[api/customers] GET ok", result.stats, {
    activeCompanyId: companyId,
    apiCompanyId: companyId,
    trash,
    backfilledOrphanCount: result.backfilledOrphanCount,
  });

  return NextResponse.json({
    ok: true,
    rows: result.rows,
    fetchedCount: result.fetchedCount,
    companyId,
    backfilledOrphanCount: result.backfilledOrphanCount,
    stats: result.stats,
  });
}
