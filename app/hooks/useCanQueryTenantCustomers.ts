"use client";

import { usePathname } from "next/navigation";
import { useActiveCompany } from "../components/ActiveCompanyProvider";
import { canQueryTenantCustomers } from "../lib/tenantClientAuth";
import { useAuthSession } from "./useAuthSession";

/** True when client may query `customers` or other tenant tables. */
export function useCanQueryTenantCustomers(): {
  canQuery: boolean;
  authLoading: boolean;
  companyId: number;
  companyReady: boolean;
  sessionUserId: string | null;
} {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuthSession();
  const { companyId, ready: companyReady } = useActiveCompany();
  const sessionUserId = user?.id ?? null;

  return {
    canQuery: canQueryTenantCustomers({
      sessionUserId,
      companyId,
      companyReady,
      pathname,
    }),
    authLoading,
    companyId,
    companyReady,
    sessionUserId,
  };
}
