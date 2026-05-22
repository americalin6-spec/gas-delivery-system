import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeCustomersOnly,
  trashCustomersOnly,
} from "./customerSoftDelete";

export const CUSTOMERS_LIST_MAX_ROWS = 1000;

export type CustomersListRow = Record<string, unknown>;

export type FetchCustomersListResult = {
  rows: CustomersListRow[];
  error: string | null;
  fetchedCount: number;
  backfilledOrphanCount: number;
};

function parseRowCompanyId(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Assign active tenant to rows created without company_id (LINE webhook, legacy imports). */
async function backfillOrphanCompanyIds(
  supabase: SupabaseClient,
  rows: CustomersListRow[],
  companyId: number,
): Promise<number> {
  const orphanIds = rows
    .filter((r) => parseRowCompanyId(r.company_id) === null)
    .map((r) => r.id)
    .filter((id) => id != null);

  if (orphanIds.length === 0) return 0;

  const { error } = await supabase
    .from("customers")
    .update({ company_id: companyId })
    .in("id", orphanIds)
    .is("company_id", null);

  if (error) {
    console.error("[customersList] backfillOrphanCompanyIds failed:", error.message);
    return 0;
  }

  for (const row of rows) {
    if (parseRowCompanyId(row.company_id) === null) {
      row.company_id = companyId;
    }
  }

  return orphanIds.length;
}

/**
 * Load every CRM customer for the active company.
 * Includes rows with company_id NULL (unassigned) for backfill — never requires conversations.
 */
export async function fetchCustomersForCompanyList(
  supabase: SupabaseClient,
  companyId: number,
  options: { trash: boolean },
): Promise<FetchCustomersListResult> {
  let query = supabase.from("customers").select("*");

  query = options.trash
    ? trashCustomersOnly(query)
    : activeCustomersOnly(query);

  const { data, error } = await query
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .order(options.trash ? "deleted_at" : "created_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(CUSTOMERS_LIST_MAX_ROWS);

  if (error) {
    return {
      rows: [],
      error: error.message,
      fetchedCount: 0,
      backfilledOrphanCount: 0,
    };
  }

  const rows = (data ?? []) as CustomersListRow[];
  const backfilledOrphanCount = await backfillOrphanCompanyIds(supabase, rows, companyId);

  return {
    rows,
    error: null,
    fetchedCount: rows.length,
    backfilledOrphanCount,
  };
}
