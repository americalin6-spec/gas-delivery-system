import type { SupabaseClient } from "@supabase/supabase-js";
import {
  customerIdMatchValues,
  syncCustomerPrimaryLineUserId,
  type LineUserBindingRow,
} from "./lineCustomerBinding";

export { customerIdMatchValues } from "./lineCustomerBinding";
export type { LineUserBindingRow } from "./lineCustomerBinding";

const SELECT_COLUMNS = "line_user_id, display_name, created_at, customer_id";

function normalizeIdToken(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function customerIdsMatch(stored: unknown, candidates: string[]): boolean {
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

function rowMatchesCustomer(row: LineUserBindingRow, candidates: string[]): boolean {
  return customerIdsMatch(row.customer_id, candidates);
}

function absorbRows(
  merged: Map<string, LineUserBindingRow>,
  data: LineUserBindingRow[] | null,
  candidates: string[],
): void {
  for (const row of data ?? []) {
    const lineUserId = row.line_user_id?.trim();
    if (!lineUserId || !rowMatchesCustomer(row, candidates)) continue;
    merged.set(lineUserId, {
      line_user_id: lineUserId,
      display_name: row.display_name ?? null,
      created_at: row.created_at ?? null,
      customer_id: row.customer_id != null ? String(row.customer_id).trim() : null,
    });
  }
}

function addRowByLineUserId(
  merged: Map<string, LineUserBindingRow>,
  row: LineUserBindingRow | null | undefined,
  fallbackCustomerId: string,
): void {
  const lineUserId = row?.line_user_id?.trim();
  if (!lineUserId) return;
  const storedCid = row.customer_id != null ? String(row.customer_id).trim() : "";
  merged.set(lineUserId, {
    line_user_id: lineUserId,
    display_name: row.display_name ?? null,
    created_at: row.created_at ?? null,
    customer_id: storedCid || fallbackCustomerId,
  });
}

/** Read customers.line_user_id for this CRM customer (id may be uuid or bigint string). */
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

    if (error) {
      console.warn("[lineUsers] resolveCustomerLineUserId error:", error.message, { cid });
      continue;
    }
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

  if (error) {
    console.warn("[lineUsers] resolveCustomerLineUserId or() error:", error.message);
    return null;
  }

  const lineId = data?.line_user_id;
  return typeof lineId === "string" && lineId.trim() ? lineId.trim() : null;
}

async function fetchLineUserByLineUserId(
  supabase: SupabaseClient,
  lineUserId: string,
): Promise<LineUserBindingRow | null> {
  const { data, error } = await supabase
    .from("line_users")
    .select(SELECT_COLUMNS)
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (error) {
    console.warn("[lineUsers] fetch by line_user_id error:", error.message, { lineUserId });
    return null;
  }
  return (data as LineUserBindingRow) ?? null;
}

/**
 * Load every line_users row for a CRM customer.
 * Matches line_users.customer_id = customers.id OR customers.line_user_id = line_users.line_user_id.
 */
export async function fetchLineUsersForCustomer(
  supabase: SupabaseClient,
  customerId: string,
  companyId?: number,
  options?: { primaryLineUserId?: string | null; skipSync?: boolean },
): Promise<{ rows: LineUserBindingRow[]; error: string | null }> {
  const candidates = customerIdMatchValues(customerId);
  if (candidates.length === 0) {
    return { rows: [], error: null };
  }

  if (!options?.skipSync) {
    await syncCustomerPrimaryLineUserId(supabase, customerId, companyId);
  }

  const merged = new Map<string, LineUserBindingRow>();
  let lastError: string | null = null;

  const customerLineUserId =
    options?.primaryLineUserId?.trim() ||
    (await resolveCustomerLineUserId(supabase, customerId));

  const logStats = {
    customerId,
    companyId: companyId ?? null,
    matchCandidates: candidates,
    customerLineUserId: customerLineUserId ?? null,
    viaCustomerLineUserId: false,
    directOrCount: 0,
    companyScanCount: 0,
    broadScanCount: 0,
  };

  // 1) customers.line_user_id → line_users.line_user_id (always show when linked)
  if (customerLineUserId) {
    const byLine = await fetchLineUserByLineUserId(supabase, customerLineUserId);
    if (byLine) {
      logStats.viaCustomerLineUserId = true;
      addRowByLineUserId(merged, byLine, customerId);
    }
  }

  // 2) line_users.customer_id = customer.id
  const orParts = candidates.map((c) => `customer_id.eq.${c}`);
  if (orParts.length > 0) {
    const direct = await supabase
      .from("line_users")
      .select(SELECT_COLUMNS)
      .or(orParts.join(","))
      .order("created_at", { ascending: false })
      .limit(500);

    if (direct.error) {
      lastError = direct.error.message;
      console.warn("[lineUsers] direct or() query error:", direct.error.message);
    } else {
      logStats.directOrCount = (direct.data ?? []).length;
      absorbRows(merged, direct.data as LineUserBindingRow[], candidates);
    }
  }

  // 3) Company-scoped scan + in-memory customer_id match
  if (companyId != null && companyId > 0) {
    const scoped = await supabase
      .from("line_users")
      .select(SELECT_COLUMNS)
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (scoped.error) {
      lastError = scoped.error.message;
      console.warn("[lineUsers] company scan error:", scoped.error.message);
    } else {
      logStats.companyScanCount = (scoped.data ?? []).length;
      absorbRows(merged, scoped.data as LineUserBindingRow[], candidates);
    }
  }

  // 4) Broad scan when still empty
  if (merged.size === 0) {
    const broad = await supabase
      .from("line_users")
      .select(SELECT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (broad.error) {
      lastError = broad.error.message;
    } else {
      logStats.broadScanCount = (broad.data ?? []).length;
      absorbRows(merged, broad.data as LineUserBindingRow[], candidates);
      if (customerLineUserId) {
        const byLine = await fetchLineUserByLineUserId(supabase, customerLineUserId);
        if (byLine) addRowByLineUserId(merged, byLine, customerId);
      }
    }
  }

  const rows = Array.from(merged.values()).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  console.log("[lineUsers] fetchLineUsersForCustomer:", {
    ...logStats,
    matchedCount: rows.length,
    lineUserIds: rows.map((r) => r.line_user_id),
    storedCustomerIds: rows.map((r) => r.customer_id),
  });

  if (rows.length === 0 && lastError) {
    return { rows: [], error: lastError };
  }

  return { rows, error: null };
}
