import { isPublicPath } from "./authRoutes";

/**
 * Client-side guard: never query tenant tables without a confirmed Supabase session.
 */
export function canQueryTenantCustomers(params: {
  sessionUserId: string | null | undefined;
  companyId: number;
  companyReady?: boolean;
  pathname?: string | null;
}): boolean {
  const path = params.pathname?.trim();
  if (path && isPublicPath(path) && !params.sessionUserId?.trim()) {
    return false;
  }
  const uid = params.sessionUserId?.trim();
  if (!uid) return false;
  if (params.companyReady === false) return false;
  return Number.isFinite(params.companyId) && params.companyId > 0;
}
