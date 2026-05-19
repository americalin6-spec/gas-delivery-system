"use client";

import { COMPANY_HEADER_NAME } from "./companyContext";

/**
 * Active company id — client persistence + debug helpers.
 * React state lives in ActiveCompanyProvider (single source of truth).
 */

export const ACTIVE_COMPANY_STORAGE_KEY = "crm.companyId";

const DEBUG =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DEBUG_COMPANY === "1";

function defaultClientCompanyId(): number {
  const env = process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID;
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
  }
  return 1;
}

/** Console debug when NEXT_PUBLIC_DEBUG_COMPANY=1 or always for tenant ops in dev. */
export function logActiveCompany(
  tag: string,
  payload?: Record<string, unknown>,
): void {
  const line = { tag, activeCompanyId: getClientCompanyId(), ...payload };
  if (DEBUG) {
    console.log("[activeCompany]", line);
  } else if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    console.log("[activeCompany]", line);
  }
}

export function getClientCompanyId(): number {
  if (typeof window === "undefined") return defaultClientCompanyId();
  try {
    const raw = window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
    if (!raw) return defaultClientCompanyId();
    const n = Number(raw);
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
  } catch {
    // localStorage may be disabled
  }
  return defaultClientCompanyId();
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

/** Headers to forward the active tenant to API routes. */
export function companyIdHeader(): Record<string, string> {
  const id = getClientCompanyId();
  return { [COMPANY_HEADER_NAME]: String(id) };
}

/** Add `company_id` to a row payload (always overwrites). */
export function withClientCompanyId<T extends Record<string, unknown>>(
  row: T,
  companyId?: number,
): T & { company_id: number } {
  const cid = companyId ?? getClientCompanyId();
  const payload = { ...row, company_id: cid };
  logActiveCompany("withClientCompanyId", {
    companyId: cid,
    customer_name: row.customer_name,
  });
  return payload;
}
