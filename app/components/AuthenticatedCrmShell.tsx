"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuthSession } from "../hooks/useAuthSession";
import { isProtectedPath } from "../lib/authRoutes";
import { CrmNotificationBell } from "./CrmNotificationBell";
import { TenantBootstrap } from "./auth/TenantBootstrap";

/**
 * CRM chrome and tenant bootstrap only after login on protected app routes.
 * Public marketing pages must not mount notification polling or tenant sync.
 */
export function AuthenticatedCrmShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, loading } = useAuthSession();
  const pathReady = pathname != null && pathname.length > 0;
  const protectedRoute = pathReady ? isProtectedPath(pathname) : false;
  const showCrm =
    pathReady && !loading && Boolean(session?.user) && protectedRoute;

  return (
    <>
      {showCrm ? <TenantBootstrap /> : null}
      {showCrm ? <CrmNotificationBell /> : null}
      {children}
    </>
  );
}
