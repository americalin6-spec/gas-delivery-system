import type { AppLang } from "./appLang";
import { parseTimestamp } from "./followUpWorkspace";

export const CUSTOMER_DELETED_AT_COLUMN = "deleted_at";

export function softDeleteCustomerPayload(): { deleted_at: string } {
  return { deleted_at: new Date().toISOString() };
}

export function restoreCustomerPayload(): { deleted_at: null } {
  return { deleted_at: null };
}

export function isCustomerInTrash(row: { deleted_at?: unknown }): boolean {
  if (row.deleted_at == null) return false;
  const s = String(row.deleted_at).trim();
  return s !== "" && s !== "null";
}

/** Supabase query: active customers only. */
export function activeCustomersOnly<T extends { is: (col: string, val: null) => T }>(
  query: T,
): T {
  return query.is(CUSTOMER_DELETED_AT_COLUMN, null);
}

/** Supabase query: trash customers only. */
export function trashCustomersOnly<
  T extends { not: (col: string, op: string, val: null) => T },
>(query: T): T {
  return query.not(CUSTOMER_DELETED_AT_COLUMN, "is", null);
}

/** Display: 2026/05/22 上午 07:20 (zh) */
export function formatCustomerCreatedAtDisplay(
  value: unknown,
  lang: AppLang,
): string | null {
  const d = parseTimestamp(value);
  if (!d) return null;
  if (lang === "zh") {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = d.getHours();
    const ampm = hours < 12 ? "上午" : "下午";
    const h12 = String(hours % 12 || 12).padStart(2, "0");
    const minute = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${day} ${ampm} ${h12}:${minute}`;
  }
  try {
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return d.toISOString();
  }
}

export function getCustomerLastContactAt(row: {
  last_contacted_at?: unknown;
  last_contact_at?: unknown;
}): Date | null {
  return parseTimestamp(row.last_contacted_at) ?? parseTimestamp(row.last_contact_at);
}
