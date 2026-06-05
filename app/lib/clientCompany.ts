"use client";

import { logActiveCompany as logActiveCompanyBase } from "./activeCompanyLog";

/**
 * Display-only persistence for active company id (UI labels).
 * Never read back for tenant authority — React state from bootstrap only.
 */

export const ACTIVE_COMPANY_STORAGE_KEY = "crm.companyId";

/** Client wrapper — logs with explicit company id when provided. */
export function logActiveCompany(
  tag: string,
  payload?: Record<string, unknown>,
): void {
  logActiveCompanyBase(tag, payload ?? {});
}

/** Write server company id for UI display only (never read for API access). */
export function setClientCompanyId(id: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return;
  try {
    window.localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, String(id));
    window.dispatchEvent(new CustomEvent("crm:companyChanged", { detail: { id } }));
    logActiveCompany("setClientCompanyId", { companyId: id });
  } catch (err) {
    console.error("[clientCompany] setClientCompanyId failed:", err);
  }
}

/** Clear persisted tenant after logout so public pages never reuse a stale id. */
export function clearClientCompanyId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("crm:companyChanged", { detail: { id: 0 } }));
    logActiveCompany("clearClientCompanyId");
  } catch (err) {
    console.error("[clientCompany] clearClientCompanyId failed:", err);
  }
}

/**
 * @deprecated Tenant identity is resolved server-side. Always returns {}.
 */
export function companyIdHeader(_companyId?: number): Record<string, string> {
  return {};
}

/** Add `company_id` to a row payload (explicit company id required). */
export function withClientCompanyId<T extends Record<string, unknown>>(
  row: T,
  companyId: number,
): T & { company_id: number } {
  if (!Number.isFinite(companyId) || companyId <= 0) {
    throw new Error("withClientCompanyId: active company is not set");
  }
  const payload = { ...row, company_id: companyId };
  logActiveCompany("withClientCompanyId", {
    companyId,
    customer_name: row.customer_name,
  });
  return payload;
}
