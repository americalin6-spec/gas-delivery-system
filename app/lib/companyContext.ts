import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Multi-tenant context, server side.
 *
 * Single source of truth for resolving which company a server request acts on.
 * `DEFAULT_COMPANY_ID` is for LINE webhook / cron only — never for authenticated CRM APIs.
 * CRM routes resolve company via `requireApiAuth` (owned workspace + company_members).
 */

export const COMPANY_HEADER_NAME = "x-company-id";

function parseCompanyIdValue(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

function envCompanyId(): number {
  return (
    parseCompanyIdValue(process.env.DEFAULT_COMPANY_ID) ??
    parseCompanyIdValue(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID) ??
    1
  );
}

export const DEFAULT_COMPANY_ID: number = envCompanyId();

/** Resolve the active company id for a server request. */
export function getServerCompanyId(req?: Request | null): number {
  if (!req) return DEFAULT_COMPANY_ID;
  const header = req.headers.get(COMPANY_HEADER_NAME);
  return parseCompanyIdValue(header) ?? DEFAULT_COMPANY_ID;
}

/** Inject `company_id` into a row payload. */
export function withCompanyId<T extends Record<string, unknown>>(
  row: T,
  companyId: number,
): T & { company_id: number } {
  return { ...row, company_id: companyId };
}

/** List every known company id. Used by cron jobs that fan out across tenants. */
export async function listCompanyIds(supabase: SupabaseClient): Promise<number[]> {
  const { data, error } = await supabase.from("companies").select("id");
  if (error) {
    console.error("[companyContext] listCompanyIds failed:", error.message);
    return [DEFAULT_COMPANY_ID];
  }
  const ids = (data ?? [])
    .map((r) => parseCompanyIdValue((r as { id: unknown }).id?.toString?.()))
    .filter((v): v is number => v != null);
  return ids.length > 0 ? ids : [DEFAULT_COMPANY_ID];
}
