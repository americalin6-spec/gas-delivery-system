"use client";

import { useEffect, useState } from "react";
import { COMPANY_HEADER_NAME } from "./companyContext";

/**
 * Multi-tenant context, client side.
 *
 * The active company id is stored in localStorage so it survives reloads, and
 * forwarded to API routes through the `x-company-id` header. All client-side
 * Supabase queries should filter on this value via `.eq("company_id", id)`.
 *
 * Until proper auth is added, the company switcher in /settings writes here.
 */

const STORAGE_KEY = "crm.companyId";

function defaultClientCompanyId(): number {
  const env = process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID;
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
  }
  return 1;
}

export function getClientCompanyId(): number {
  if (typeof window === "undefined") return defaultClientCompanyId();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultClientCompanyId();
    const n = Number(raw);
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
  } catch {
    // localStorage may be disabled — fall through
  }
  return defaultClientCompanyId();
}

export function setClientCompanyId(id: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id));
    window.dispatchEvent(new CustomEvent("crm:companyChanged", { detail: { id } }));
  } catch (err) {
    console.error("[clientCompany] setClientCompanyId failed:", err);
  }
}

/** Headers to forward the active tenant to API routes. */
export function companyIdHeader(): Record<string, string> {
  return { [COMPANY_HEADER_NAME]: String(getClientCompanyId()) };
}

/** Add `company_id` to a row payload, e.g. for Supabase inserts. */
export function withClientCompanyId<T extends Record<string, unknown>>(
  row: T,
): T & { company_id: number } {
  return { ...row, company_id: getClientCompanyId() };
}

/** React hook returning the active company id. Updates when /settings changes it. */
export function useCurrentCompanyId(): number {
  const [companyId, setCompanyId] = useState<number>(defaultClientCompanyId());

  useEffect(() => {
    setCompanyId(getClientCompanyId());

    function onChange() {
      setCompanyId(getClientCompanyId());
    }

    window.addEventListener("crm:companyChanged", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("crm:companyChanged", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return companyId;
}
