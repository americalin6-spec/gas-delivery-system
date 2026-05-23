import { DEFAULT_COMPANY_ID } from "./companyContext";

const DEBUG =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DEBUG_COMPANY === "1";

/** Server-safe tenant debug logging (no client-only APIs). */
export function logActiveCompany(
  tag: string,
  payload?: Record<string, unknown>,
): void {
  const fromPayload = payload?.companyId;
  const activeCompanyId =
    typeof fromPayload === "number" && Number.isFinite(fromPayload)
      ? fromPayload
      : DEFAULT_COMPANY_ID;
  const line = { tag, activeCompanyId, ...payload };
  if (DEBUG) {
    console.log("[activeCompany]", line);
  } else if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    console.log("[activeCompany]", line);
  }
}
