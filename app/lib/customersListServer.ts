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
  byCompanyIdQueryCount: number;
  byNullCompanyIdQueryCount: number;
};

export type FetchCustomersListResult = {
  rows: CustomersListRow[];
  error: string | null;
  fetchedCount: number;
  backfilledOrphanCount: number;
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
    byCompanyIdQueryCount: 0,
    byNullCompanyIdQueryCount: 0,
  };
}

export function logCustomerListStats(
  tag: string,
  stats: CustomersListFetchStats,
  extra?: Record<string, unknown>,
): void {
  console.log(tag, { ...stats, ...extra });
}

function mergeCustomersById(...lists: CustomersListRow[][]): CustomersListRow[] {
  const map = new Map<string, CustomersListRow>();
  for (const list of lists) {
    for (const row of list) {
      const id = row.id == null ? "" : String(row.id);
      if (!id) continue;
      map.set(id, row);
    }
  }
  return [...map.values()];
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
 * Two explicit queries (eq + is null) — avoids PostgREST .or() dropping rows with other filters.
 */
export async function fetchCustomersForCompanyList(
  supabase: SupabaseClient,
  companyId: number,
  options: { trash: boolean },
): Promise<FetchCustomersListResult> {
  const emptyStats = summarizeCustomerListRows([], companyId);

  const baseSelect = () => supabase.from("customers").select("*");

  const [byCompanyRes, byNullCompanyRes] = await Promise.all([
    options.trash
      ? trashCustomersOnly(baseSelect())
          .eq("company_id", companyId)
          .limit(CUSTOMERS_LIST_MAX_ROWS)
      : activeCustomersOnly(baseSelect())
          .eq("company_id", companyId)
          .limit(CUSTOMERS_LIST_MAX_ROWS),
    options.trash
      ? trashCustomersOnly(baseSelect())
          .is("company_id", null)
          .limit(CUSTOMERS_LIST_MAX_ROWS)
      : activeCustomersOnly(baseSelect())
          .is("company_id", null)
          .limit(CUSTOMERS_LIST_MAX_ROWS),
  ]);

  if (byCompanyRes.error) {
    console.error("[customersList] byCompanyId query failed:", byCompanyRes.error.message);
    return {
      rows: [],
      error: byCompanyRes.error.message,
      fetchedCount: 0,
      backfilledOrphanCount: 0,
      stats: emptyStats,
    };
  }

  if (byNullCompanyRes.error) {
    console.error("[customersList] byNullCompanyId query failed:", byNullCompanyRes.error.message);
    return {
      rows: [],
      error: byNullCompanyRes.error.message,
      fetchedCount: 0,
      backfilledOrphanCount: 0,
      stats: emptyStats,
    };
  }

  const byCompanyRows = (byCompanyRes.data ?? []) as CustomersListRow[];
  const byNullRows = (byNullCompanyRes.data ?? []) as CustomersListRow[];

  logCustomerListStats(
    "[customersList] query byCompanyId",
    {
      ...summarizeCustomerListRows(byCompanyRows, companyId),
      byCompanyIdQueryCount: byCompanyRows.length,
      byNullCompanyIdQueryCount: 0,
    },
    { activeCompanyId: companyId, trash: options.trash },
  );

  logCustomerListStats(
    "[customersList] query byNullCompanyId",
    {
      ...summarizeCustomerListRows(byNullRows, companyId),
      byCompanyIdQueryCount: 0,
      byNullCompanyIdQueryCount: byNullRows.length,
    },
    { activeCompanyId: companyId, trash: options.trash },
  );

  const merged = sortCustomerRows(
    mergeCustomersById(byCompanyRows, byNullRows),
    options.trash,
  );

  const stats = summarizeCustomerListRows(merged, companyId);
  stats.byCompanyIdQueryCount = byCompanyRows.length;
  stats.byNullCompanyIdQueryCount = byNullRows.length;

  logCustomerListStats("[customersList] merged result", stats, {
    activeCompanyId: companyId,
    trash: options.trash,
  });

  const backfilledOrphanCount = await backfillOrphanCompanyIds(supabase, merged, companyId);

  if (backfilledOrphanCount > 0) {
    const afterBackfill = summarizeCustomerListRows(merged, companyId);
    afterBackfill.byCompanyIdQueryCount = stats.byCompanyIdQueryCount;
    afterBackfill.byNullCompanyIdQueryCount = stats.byNullCompanyIdQueryCount;
    logCustomerListStats("[customersList] after backfill", afterBackfill, {
      backfilledOrphanCount,
    });
  }

  return {
    rows: merged,
    error: null,
    fetchedCount: merged.length,
    backfilledOrphanCount,
    stats,
  };
}
