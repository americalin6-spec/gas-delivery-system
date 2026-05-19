import type { SupabaseClient } from "@supabase/supabase-js";
import { logActiveCompany } from "./clientCompany";

function parseRowCompanyId(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Fetch one customer scoped to the active company.
 * If the row exists with company_id NULL, assign active company_id and return it.
 * If the row belongs to another company, returns null (no cross-tenant leak).
 */
export async function fetchCustomerByIdForActiveCompany<T>(
  supabase: SupabaseClient,
  customerId: string,
  companyId: number,
): Promise<{ customer: T | null; error: Error | null }> {
  logActiveCompany("fetchCustomerById.start", { customerId, companyId });

  const scoped = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (scoped.error) {
    console.error("[customersTenant] scoped fetch error:", scoped.error);
    return { customer: null, error: scoped.error };
  }
  if (scoped.data) {
    logActiveCompany("fetchCustomerById.hit", { customerId, companyId });
    return { customer: scoped.data as T, error: null };
  }

  const fallback = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();

  if (fallback.error) {
    console.error("[customersTenant] fallback fetch error:", fallback.error);
    return { customer: null, error: fallback.error };
  }
  if (!fallback.data) {
    logActiveCompany("fetchCustomerById.missing", { customerId, companyId });
    return { customer: null, error: null };
  }

  const row = fallback.data as Record<string, unknown>;
  const existingCompanyId = parseRowCompanyId(row.company_id);

  if (existingCompanyId === null) {
    logActiveCompany("fetchCustomerById.backfillNull", { customerId, companyId });
    const patched = await supabase
      .from("customers")
      .update({ company_id: companyId })
      .eq("id", customerId)
      .is("company_id", null)
      .select("*")
      .maybeSingle();

    if (patched.error) {
      console.error("[customersTenant] backfill error:", patched.error);
      return { customer: null, error: patched.error };
    }
    return { customer: (patched.data as T) ?? null, error: null };
  }

  logActiveCompany("fetchCustomerById.wrongTenant", {
    customerId,
    activeCompanyId: companyId,
    rowCompanyId: existingCompanyId,
  });
  return { customer: null, error: null };
}

/** Build insert payload — always sets company_id to active tenant (overwrites body). */
export function customerInsertPayload<T extends Record<string, unknown>>(
  row: T,
  companyId: number,
): T & { company_id: number } {
  const payload = { ...row, company_id: companyId };
  logActiveCompany("customerInsertPayload", {
    companyId,
    customer_name: row.customer_name,
    keys: Object.keys(row),
  });
  return payload;
}
