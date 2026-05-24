"use client";

import { logActiveCompany as logActiveCompanyBase } from "./activeCompanyLog";
import { COMPANY_HEADER_NAME } from "./companyContext";

/**
 * Active company id — client persistence + debug helpers.
 * React state lives in ActiveCompanyProvider (single source of truth).
 */

export const ACTIVE_COMPANY_STORAGE_KEY = "crm.companyId";

/** Client wrapper — injects persisted active company id into tenant logs. */
export function logActiveCompany(
  tag: string,
  payload?: Record<string, unknown>,
): void {
  logActiveCompanyBase(tag, { ...payload, companyId: getClientCompanyId() });
}

/**
 * Persisted tenant id. Returns 0 when unset — never defaults to shared company 1.
 */
export function getClientCompanyId(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
  } catch {
    // localStorage may be disabled
  }
  return 0;
}

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

/** Headers to forward the active tenant to API routes (omitted until company is known). */
export function companyIdHeader(companyId?: number): Record<string, string> {
  const id = companyId ?? getClientCompanyId();
  if (!Number.isFinite(id) || id <= 0) return {};
  return { [COMPANY_HEADER_NAME]: String(id) };
}

/** Add `company_id` to a row payload (always overwrites). */
export function withClientCompanyId<T extends Record<string, unknown>>(
  row: T,
  companyId?: number,
): T & { company_id: number } {
  const cid = companyId ?? getClientCompanyId();
  if (!Number.isFinite(cid) || cid <= 0) {
    throw new Error("withClientCompanyId: active company is not set");
  }
  const payload = { ...row, company_id: cid };
  logActiveCompany("withClientCompanyId", {
    companyId: cid,
    customer_name: row.customer_name,
  });
  return payload;
}
