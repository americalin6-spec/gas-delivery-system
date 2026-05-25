/**
 * Client-side guard: never query tenant tables without a confirmed Supabase session.
 */
export function canQueryTenantCustomers(params: {
  sessionUserId: string | null | undefined;
  companyId: number;
  companyReady?: boolean;
}): boolean {
  const uid = params.sessionUserId?.trim();
  if (!uid) return false;
  if (params.companyReady === false) return false;
  return Number.isFinite(params.companyId) && params.companyId > 0;
}
