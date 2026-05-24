import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeCustomersOnly,
  trashCustomersOnly,
} from "./customerSoftDelete";

export const CUSTOMERS_LIST_MAX_ROWS = 1000;

export type CustomersListRow = Record<string, unknown>;

export type CustomersListFetchStats = {
  totalRowsReturned: number;
  rowsWithNullCompanyId: number;
  rowsWithActiveCompanyId: number;
  rowsOtherCompanyId: number;
  rowsFilteredByCompanyId: number;
};

export type FetchCustomersListResult = {
  rows: CustomersListRow[];
  error: string | null;
  fetchedCount: number;
  stats: CustomersListFetchStats;
};

function parseRowCompanyId(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function summarizeCustomerListRows(
  rows: CustomersListRow[],
  companyId: number,
): CustomersListFetchStats {
  let rowsWithNullCompanyId = 0;
  let rowsWithActiveCompanyId = 0;
  let rowsOtherCompanyId = 0;

  for (const row of rows) {
    const cid = parseRowCompanyId(row.company_id);
    if (cid === null) rowsWithNullCompanyId += 1;
    else if (cid === companyId) rowsWithActiveCompanyId += 1;
    else rowsOtherCompanyId += 1;
  }

  return {
    totalRowsReturned: rows.length,
    rowsWithNullCompanyId,
    rowsWithActiveCompanyId,
    rowsOtherCompanyId,
    rowsFilteredByCompanyId: rowsOtherCompanyId,
  };
}

export function logCustomerListStats(
  tag: string,
  stats: CustomersListFetchStats,
  extra?: Record<string, unknown>,
): void {
  console.log(tag, { ...stats, ...extra });
}

function sortCustomerRows(rows: CustomersListRow[], trash: boolean): CustomersListRow[] {
  const key = trash ? "deleted_at" : "created_at";
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const at = av ? new Date(String(av)).getTime() : 0;
    const bt = bv ? new Date(String(bv)).getTime() : 0;
    return bt - at;
  });
}

/** Rows strictly belonging to this tenant (null/other company_id excluded). */
export function filterRowsForCompany(
  rows: CustomersListRow[],
  companyId: number,
): CustomersListRow[] {
  return rows.filter((row) => parseRowCompanyId(row.company_id) === companyId);
}

/**
 * Load CRM customers for one company only.
 * Never merges null company_id rows — orphans are invisible to normal users.
 */
export async function fetchCustomersForCompanyList(
  supabase: SupabaseClient,
  companyId: number,
  options: { trash: boolean },
): Promise<FetchCustomersListResult> {
  const emptyStats = summarizeCustomerListRows([], companyId);

  if (!Number.isFinite(companyId) || companyId <= 0) {
    return {
      rows: [],
      error: "invalid company_id",
      fetchedCount: 0,
      stats: emptyStats,
    };
  }

  const baseSelect = () => supabase.from("customers").select("*");

  const query = options.trash
    ? trashCustomersOnly(baseSelect())
        .eq("company_id", companyId)
        .limit(CUSTOMERS_LIST_MAX_ROWS)
    : activeCustomersOnly(baseSelect())
        .eq("company_id", companyId)
        .limit(CUSTOMERS_LIST_MAX_ROWS);

  const { data, error } = await query;

  if (error) {
    console.error("[customersList] query failed:", error.message, { companyId });
    return {
      rows: [],
      error: error.message,
      fetchedCount: 0,
      stats: emptyStats,
    };
  }

  const scoped = filterRowsForCompany((data ?? []) as CustomersListRow[], companyId);
  const sorted = sortCustomerRows(scoped, options.trash);
  const stats = summarizeCustomerListRows(sorted, companyId);

  logCustomerListStats("[customersList] result", stats, {
    activeCompanyId: companyId,
    trash: options.trash,
  });

  return {
    rows: sorted,
    error: null,
    fetchedCount: sorted.length,
    stats,
  };
}
