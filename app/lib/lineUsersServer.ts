import type { SupabaseClient } from "@supabase/supabase-js";

export type LineUserBindingRow = {
  line_user_id: string;
  display_name: string | null;
  created_at: string | null;
  customer_id: string | null;
};

const SELECT_COLUMNS = "line_user_id, display_name, created_at, customer_id";

/** Match CRM id whether stored as text "42", numeric string, etc. */
export function customerIdMatchValues(customerId: string): string[] {
  const id = customerId.trim();
  const out = new Set<string>();
  if (id) out.add(id);
  const n = Number(id);
  if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
    out.add(String(n));
  }
  return [...out];
}

function customerIdsMatch(stored: unknown, candidate: string): boolean {
  const s = String(stored ?? "").trim();
  const c = candidate.trim();
  if (!s || !c) return false;
  if (s === c) return true;
  const ns = Number(s);
  const nc = Number(c);
  return Number.isFinite(ns) && Number.isFinite(nc) && ns === nc;
}

function rowMatchesCustomer(row: LineUserBindingRow, candidates: string[]): boolean {
  return candidates.some((c) => customerIdsMatch(row.customer_id, c));
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

/**
 * Load every line_users row for a CRM customer.
 * Never uses .single() or limit(1). Returns all matches as an array.
 */
export async function fetchLineUsersForCustomer(
  supabase: SupabaseClient,
  customerId: string,
  companyId?: number,
): Promise<{ rows: LineUserBindingRow[]; error: string | null }> {
  const candidates = customerIdMatchValues(customerId);
  if (candidates.length === 0) {
    return { rows: [], error: null };
  }

  const merged = new Map<string, LineUserBindingRow>();
  let lastError: string | null = null;

  const runIn = await supabase
    .from("line_users")
    .select(SELECT_COLUMNS)
    .in("customer_id", candidates)
    .order("created_at", { ascending: false })
    .limit(500);

  if (runIn.error) {
    lastError = runIn.error.message;
  } else {
    absorbRows(merged, runIn.data as LineUserBindingRow[], candidates);
  }

  if (merged.size === 0) {
    for (const cid of candidates) {
      const res = await supabase
        .from("line_users")
        .select(SELECT_COLUMNS)
        .eq("customer_id", cid)
        .order("created_at", { ascending: false })
        .limit(500);

      if (res.error) {
        lastError = res.error.message;
        continue;
      }
      absorbRows(merged, res.data as LineUserBindingRow[], candidates);
    }
  }

  if (merged.size === 0 && companyId != null && companyId > 0) {
    const scoped = await supabase
      .from("line_users")
      .select(SELECT_COLUMNS)
      .eq("company_id", companyId)
      .not("customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (scoped.error) {
      lastError = scoped.error.message;
    } else {
      absorbRows(merged, scoped.data as LineUserBindingRow[], candidates);
    }
  }

  if (merged.size === 0 && !lastError) {
    const broad = await supabase
      .from("line_users")
      .select(SELECT_COLUMNS)
      .not("customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!broad.error) {
      absorbRows(merged, broad.data as LineUserBindingRow[], candidates);
    } else {
      lastError = broad.error.message;
    }
  }

  const rows = Array.from(merged.values()).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  if (rows.length === 0 && lastError) {
    return { rows: [], error: lastError };
  }

  return { rows, error: null };
}
