import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppLang } from "./appLang";
import { logActiveCompany } from "./activeCompanyLog";
import { logCustomerWrite } from "./customerWriteDebug";
import {
  assertCustomerWriteAllowed,
  markCustomerWriteCompleted,
} from "./customerWriteGate";
import { activeCustomersOnly, isCustomerInTrash } from "./customerSoftDelete";
import { applySanitizedCrmDateFieldsToPayload } from "./sanitizeImportantDateFields";

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

  const scoped = await activeCustomersOnly(
    supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .eq("company_id", companyId),
  ).maybeSingle();

  if (scoped.error) {
    console.error("[customersTenant] scoped fetch error:", scoped.error);
    return { customer: null, error: scoped.error };
  }
  if (scoped.data) {
    if (isCustomerInTrash(scoped.data as { deleted_at?: unknown })) {
      logActiveCompany("fetchCustomerById.trash", { customerId, companyId });
      return { customer: null, error: null };
    }
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

export type CustomerContactKeys = {
  phone?: string | null;
  line_id?: string | null;
  email?: string | null;
};

/** Match existing row by company + phone, line_id, or email (any non-empty field). */
export async function findExistingCustomerByContact(
  supabase: SupabaseClient,
  companyId: number,
  contact: CustomerContactKeys,
): Promise<string | null> {
  const phone = contact.phone?.trim() || null;
  const lineId = contact.line_id?.trim() || null;
  const email = contact.email?.trim() || null;
  if (!phone && !lineId && !email) return null;

  const parts: string[] = [];
  if (phone) parts.push(`phone.eq.${phone}`);
  if (lineId) parts.push(`line_id.eq.${lineId}`);
  if (email) parts.push(`email.eq.${email}`);

  const { data, error } = await activeCustomersOnly(
    supabase
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .or(parts.join(",")),
  )
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[customersTenant] findExistingCustomerByContact", error.message);
    return null;
  }

  if (data?.id == null) return null;
  return String(data.id);
}

export type UpsertCustomerMeta = {
  requestId: string;
  source: string;
  /** Original LINE conversation — required for date field sanitization on insert. */
  conversationText?: string;
  lang?: AppLang;
};

export type UpsertCustomerResult = {
  customerId: string | null;
  action: "insert" | "update";
  customer: Record<string, unknown> | null;
  error: { message: string } | null;
};

/** Insert a new customer row for the active company (always creates a new record). */
function writeEventFields(
  payload: Record<string, unknown>,
  companyId: number,
  meta: UpsertCustomerMeta,
  action: "insert" | "update",
) {
  logCustomerWrite({
    requestId: meta.requestId,
    source: meta.source,
    action,
    customer_name: (payload.customer_name as string | null | undefined) ?? null,
    phone: (payload.phone as string | null | undefined) ?? null,
    line_id: (payload.line_id as string | null | undefined) ?? null,
    company_id: companyId,
    timestamp: new Date().toISOString(),
  });
}

export async function upsertCustomerForCompany(
  supabase: SupabaseClient,
  companyId: number,
  row: Record<string, unknown>,
  meta: UpsertCustomerMeta,
): Promise<UpsertCustomerResult> {
  const gate = assertCustomerWriteAllowed(meta.source, meta.requestId);
  if (!gate.allowed) {
    logCustomerWrite({
      requestId: meta.requestId,
      source: meta.source,
      action: "blocked",
      customer_name: (row.customer_name as string | null | undefined) ?? null,
      phone: (row.phone as string | null | undefined) ?? null,
      line_id: (row.line_id as string | null | undefined) ?? null,
      company_id: companyId,
      timestamp: new Date().toISOString(),
      detail: gate.reason,
    });
    return {
      customerId: null,
      action: "insert",
      customer: null,
      error: { message: gate.reason ?? "customer write blocked" },
    };
  }

  let payload = customerInsertPayload(row, companyId);
  if (meta.conversationText != null) {
    payload = applySanitizedCrmDateFieldsToPayload(
      payload,
      meta.conversationText,
      meta.lang ?? "zh",
    ) as typeof payload;
  }

  writeEventFields(payload, companyId, meta, "insert");

  const { data, error } = await supabase
    .from("customers")
    .insert([payload])
    .select("*")
    .maybeSingle();

  if (!error) {
    markCustomerWriteCompleted();
  }

  const inserted = data && typeof data === "object" ? (data as Record<string, unknown>) : null;

  return {
    customerId: inserted?.id != null ? String(inserted.id) : null,
    action: "insert",
    customer: inserted,
    error: error ? { message: error.message } : null,
  };
}
