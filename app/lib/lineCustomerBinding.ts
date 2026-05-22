import type { SupabaseClient } from "@supabase/supabase-js";

export type LineUserBindingRow = {
  line_user_id: string;
  display_name: string | null;
  created_at: string | null;
  customer_id: string | null;
};

const LINE_USER_SELECT = "line_user_id, display_name, created_at, customer_id";

function normalizeIdToken(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Match CRM id whether stored as text, bigint string, or UUID (case-insensitive). */
export function customerIdMatchValues(customerId: string): string[] {
  const raw = customerId.trim();
  const out = new Set<string>();
  if (!raw) return [];

  out.add(raw);
  out.add(raw.toLowerCase());
  out.add(raw.toUpperCase());

  const n = Number(raw);
  if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
    out.add(String(n));
  }

  if (/^[0-9a-f-]{32,36}$/i.test(raw)) {
    out.add(raw.toLowerCase());
  }

  return [...out];
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

/** Primary binding: same customer_id, newest created_at. */
export function pickPrimaryLineBinding(
  rows: LineUserBindingRow[],
): LineUserBindingRow | null {
  const valid = rows.filter((r) => r.line_user_id?.trim());
  if (valid.length === 0) return null;

  return [...valid].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  })[0];
}

/** Load line_users rows whose customer_id matches this CRM customer. */
export async function fetchLineUserRowsByCustomerId(
  supabase: SupabaseClient,
  customerId: string,
  _companyId?: number,
): Promise<LineUserBindingRow[]> {
  const candidates = customerIdMatchValues(customerId);
  if (candidates.length === 0) return [];

  const merged = new Map<string, LineUserBindingRow>();

  for (const cid of candidates) {
    const { data, error } = await supabase
      .from("line_users")
      .select(LINE_USER_SELECT)
      .eq("customer_id", cid)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) continue;
    for (const row of data ?? []) {
      const lineUserId = row.line_user_id?.trim();
      if (!lineUserId) continue;
      merged.set(lineUserId, {
        line_user_id: lineUserId,
        display_name: row.display_name ?? null,
        created_at: row.created_at ?? null,
        customer_id: row.customer_id != null ? String(row.customer_id).trim() : null,
      });
    }
  }

  if (merged.size === 0) {
    const { data } = await supabase
      .from("line_users")
      .select(LINE_USER_SELECT)
      .order("created_at", { ascending: false })
      .limit(3000);

    for (const row of data ?? []) {
      const lineUserId = row.line_user_id?.trim();
      if (!lineUserId || !customerIdsMatch(row.customer_id, candidates)) continue;
      merged.set(lineUserId, {
        line_user_id: lineUserId,
        display_name: row.display_name ?? null,
        created_at: row.created_at ?? null,
        customer_id: row.customer_id != null ? String(row.customer_id).trim() : null,
      });
    }
  }

  return Array.from(merged.values());
}

/**
 * Write customers.line_user_id (idempotent). Tries all id variants; does not require company_id match.
 */
export async function persistCustomerLineUserId(
  supabase: SupabaseClient,
  customerId: string,
  lineUserId: string,
  companyId?: number,
): Promise<{ ok: boolean; error: string | null }> {
  const lineId = lineUserId.trim();
  if (!lineId) return { ok: false, error: "empty line_user_id" };

  const candidates = customerIdMatchValues(customerId);
  if (candidates.length === 0) return { ok: false, error: "empty customer_id" };

  const orParts = candidates.map((c) => `id.eq.${c}`).join(",");

  if (companyId != null && companyId > 0) {
    const scoped = await supabase
      .from("customers")
      .update({ line_user_id: lineId })
      .eq("company_id", companyId)
      .or(orParts)
      .select("id, line_user_id")
      .limit(1);

    if (!scoped.error && (scoped.data?.length ?? 0) > 0) {
      return { ok: true, error: null };
    }
    if (scoped.error) {
      console.warn("[lineCustomerBinding] persist scoped error:", scoped.error.message);
    }
  }

  const { data, error } = await supabase
    .from("customers")
    .update({ line_user_id: lineId })
    .or(orParts)
    .select("id, line_user_id")
    .limit(1);

  if (error) {
    console.error("[lineCustomerBinding] persist error:", error.message, { customerId, lineId });
    return { ok: false, error: error.message };
  }

  const ok = (data?.length ?? 0) > 0;
  if (ok) {
    console.log("[lineCustomerBinding] persist ok:", {
      customerId,
      lineUserId: lineId,
      companyId: companyId ?? null,
    });
  }
  return { ok, error: ok ? null : "customer row not updated" };
}

/**
 * Backfill/sync customers.line_user_id from line_users (same customer_id, newest created_at).
 * Safe to call on every bind or API read.
 */
export async function syncCustomerPrimaryLineUserId(
  supabase: SupabaseClient,
  customerId: string,
  companyId?: number,
): Promise<{ lineUserId: string | null; synced: boolean; error: string | null }> {
  const bindings = await fetchLineUserRowsByCustomerId(supabase, customerId, companyId);
  const primary = pickPrimaryLineBinding(bindings);

  if (!primary?.line_user_id) {
    return { lineUserId: null, synced: false, error: null };
  }

  const { ok, error } = await persistCustomerLineUserId(
    supabase,
    customerId,
    primary.line_user_id,
    companyId,
  );

  console.log("[lineCustomerBinding] syncCustomerPrimaryLineUserId:", {
    customerId,
    companyId: companyId ?? null,
    bindingCount: bindings.length,
    primaryLineUserId: primary.line_user_id,
    synced: ok,
  });

  return {
    lineUserId: primary.line_user_id,
    synced: ok,
    error,
  };
}
