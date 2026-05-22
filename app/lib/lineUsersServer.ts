import type { SupabaseClient } from "@supabase/supabase-js";
import {
  customerIdMatchValues,
  syncCustomerPrimaryLineUserId,
  type LineUserBindingRow,
} from "./lineCustomerBinding";

export { customerIdMatchValues } from "./lineCustomerBinding";
export type { LineUserBindingRow } from "./lineCustomerBinding";

const SELECT_COLUMNS = "line_user_id, display_name, created_at, customer_id";

export type LineUsersQueryLog = {
  label: string;
  rowCount: number;
  error: string | null;
  sampleCustomerIds: (string | null)[];
  sampleLineUserIds: string[];
};

export type FetchLineUsersDebug = {
  customerIdInput: string;
  companyId: number | null;
  matchCandidates: string[];
  authKeyKind: "service_role" | "missing_service_role";
  queries: LineUsersQueryLog[];
  tableProbeCount: number;
  finalReturnedRows: number;
};

function mapLineUserRow(row: Record<string, unknown>): LineUserBindingRow | null {
  const line_user_id = String(row.line_user_id ?? "").trim();
  if (!line_user_id) return null;
  return {
    line_user_id,
    display_name:
      row.display_name == null || row.display_name === ""
        ? null
        : String(row.display_name),
    created_at: row.created_at == null ? null : String(row.created_at),
    customer_id:
      row.customer_id == null || row.customer_id === ""
        ? null
        : String(row.customer_id).trim(),
  };
}

function mergeRow(merged: Map<string, LineUserBindingRow>, row: LineUserBindingRow | null): void {
  if (!row?.line_user_id) return;
  merged.set(row.line_user_id, row);
}

function normalizeIdToken(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** In-memory match when PostgREST filters are unreliable. */
export function customerIdsMatch(stored: unknown, candidates: string[]): boolean {
  const s = normalizeIdToken(stored);
  if (!s) return false;

  for (const candidate of candidates) {
    const c = normalizeIdToken(candidate);
    if (!c) continue;
    if (s === c) return true;

    const ns = Number(s);
    const nc = Number(c);
    if (Number.isFinite(ns) && Number.isFinite(nc) && ns === nc) return true;
  }

  return false;
}

function logQuery(
  logs: LineUsersQueryLog[],
  label: string,
  data: Record<string, unknown>[] | null,
  error: { message: string } | null,
): void {
  const rows = data ?? [];
  logs.push({
    label,
    rowCount: rows.length,
    error: error?.message ?? null,
    sampleCustomerIds: rows.slice(0, 5).map((r) => {
      const v = r.customer_id;
      return v == null ? null : String(v);
    }),
    sampleLineUserIds: rows.slice(0, 5).map((r) => String(r.line_user_id ?? "")),
  });
}

/** Read customers.line_user_id for this CRM customer. */
export async function resolveCustomerLineUserId(
  supabase: SupabaseClient,
  customerId: string,
): Promise<string | null> {
  const candidates = customerIdMatchValues(customerId);
  if (candidates.length === 0) return null;

  for (const cid of candidates) {
    const { data, error } = await supabase
      .from("customers")
      .select("line_user_id")
      .eq("id", cid)
      .maybeSingle();

    if (error) continue;
    const lineId = data?.line_user_id;
    if (typeof lineId === "string" && lineId.trim()) return lineId.trim();
  }

  const orParts = candidates.map((c) => `id.eq.${c}`).join(",");
  const { data, error } = await supabase
    .from("customers")
    .select("line_user_id")
    .or(orParts)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  const lineId = data?.line_user_id;
  return typeof lineId === "string" && lineId.trim() ? lineId.trim() : null;
}

/**
 * Load line_users for a CRM customer.
 * Does not apply company_id to row matching — only customer_id + customers.line_user_id.
 */
export async function fetchLineUsersForCustomer(
  supabase: SupabaseClient,
  customerId: string,
  companyId?: number,
  options?: {
    primaryLineUserId?: string | null;
    skipSync?: boolean;
    debug?: FetchLineUsersDebug;
  },
): Promise<{ rows: LineUserBindingRow[]; error: string | null }> {
  const customerIdInput = customerId.trim();
  const candidates = customerIdMatchValues(customerIdInput);
  const queryLogs: LineUsersQueryLog[] = [];

  const debug: FetchLineUsersDebug = options?.debug ?? {
    customerIdInput,
    companyId: companyId ?? null,
    matchCandidates: candidates,
    authKeyKind: "service_role",
    queries: queryLogs,
    tableProbeCount: 0,
    finalReturnedRows: 0,
  };
  debug.queries = queryLogs;

  if (candidates.length === 0) {
    debug.finalReturnedRows = 0;
    return { rows: [], error: null };
  }

  if (!options?.skipSync) {
    await syncCustomerPrimaryLineUserId(supabase, customerIdInput, companyId);
  }

  const merged = new Map<string, LineUserBindingRow>();
  let lastError: string | null = null;

  const probe = await supabase
    .from("line_users")
    .select("line_user_id, customer_id")
    .limit(10);
  debug.tableProbeCount = probe.data?.length ?? 0;
  if (probe.error) {
    lastError = probe.error.message;
    logQuery(queryLogs, "table_probe", null, probe.error);
  } else {
    logQuery(queryLogs, "table_probe", probe.data as Record<string, unknown>[], null);
  }

  // 1) Direct .eq per candidate — trust Supabase filter; no in-memory re-filter
  for (const cid of candidates) {
    const res = await supabase
      .from("line_users")
      .select(SELECT_COLUMNS)
      .eq("customer_id", cid)
      .order("created_at", { ascending: false })
      .limit(500);

    logQuery(queryLogs, `eq.customer_id.${cid}`, res.data as Record<string, unknown>[], res.error);
    if (res.error) {
      lastError = res.error.message;
      continue;
    }
    for (const raw of res.data ?? []) {
      mergeRow(merged, mapLineUserRow(raw as Record<string, unknown>));
    }
  }

  // 2) PostgREST or() fallback (single round-trip)
  if (merged.size === 0) {
    const orParts = candidates.map((c) => `customer_id.eq.${c}`).join(",");
    const res = await supabase
      .from("line_users")
      .select(SELECT_COLUMNS)
      .or(orParts)
      .order("created_at", { ascending: false })
      .limit(500);

    logQuery(queryLogs, "or.customer_id", res.data as Record<string, unknown>[], res.error);
    if (res.error) {
      lastError = res.error.message;
    } else {
      for (const raw of res.data ?? []) {
        mergeRow(merged, mapLineUserRow(raw as Record<string, unknown>));
      }
    }
  }

  // 3) Full table scan + in-memory match (no company_id gate on matching)
  if (merged.size === 0) {
    const res = await supabase
      .from("line_users")
      .select(SELECT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(3000);

    logQuery(queryLogs, "scan_all_line_users", res.data as Record<string, unknown>[], res.error);
    if (res.error) {
      lastError = res.error.message;
    } else {
      for (const raw of res.data ?? []) {
        const row = mapLineUserRow(raw as Record<string, unknown>);
        if (!row) continue;
        if (customerIdsMatch(row.customer_id, candidates)) {
          mergeRow(merged, row);
        }
      }
    }
  }

  // 4) customers.line_user_id → line_users.line_user_id
  const customerLineUserId =
    options?.primaryLineUserId?.trim() ||
    (await resolveCustomerLineUserId(supabase, customerIdInput));

  if (customerLineUserId) {
    const res = await supabase
      .from("line_users")
      .select(SELECT_COLUMNS)
      .eq("line_user_id", customerLineUserId)
      .maybeSingle();

    logQuery(
      queryLogs,
      `eq.line_user_id.${customerLineUserId.slice(0, 12)}…`,
      res.data ? [res.data as Record<string, unknown>] : [],
      res.error,
    );

    if (res.error) {
      lastError = lastError ?? res.error.message;
    } else if (res.data) {
      const row = mapLineUserRow(res.data as Record<string, unknown>);
      if (row) {
        mergeRow(merged, {
          ...row,
          customer_id: row.customer_id || customerIdInput,
        });
      }
    }
  }

  const rows = Array.from(merged.values()).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  debug.finalReturnedRows = rows.length;

  console.log("[lineUsers] fetchLineUsersForCustomer:", {
    customerIdInput,
    companyId: companyId ?? null,
    matchCandidates: candidates,
    authKeyKind: debug.authKeyKind,
    tableProbeCount: debug.tableProbeCount,
    finalReturnedRows: rows.length,
    lineUserIds: rows.map((r) => r.line_user_id),
    storedCustomerIds: rows.map((r) => r.customer_id),
    queries: queryLogs,
  });

  if (rows.length === 0 && lastError) {
    return { rows: [], error: lastError };
  }

  return { rows, error: null };
}
