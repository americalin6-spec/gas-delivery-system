"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuthSession } from "../hooks/useAuthSession";
import { isPublicPath } from "../lib/authRoutes";
import { CrmLogoutButton } from "./CrmLogoutButton";
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
  const isPublicMarketing = pathReady && isPublicPath(pathname);
  const showCrm =
    pathReady && !loading && Boolean(session?.user) && !isPublicMarketing;

  return (
    <>
      {showCrm ? <TenantBootstrap /> : null}
      {showCrm ? <CrmLogoutButton /> : null}
      {showCrm ? <CrmNotificationBell /> : null}
      {children}
    </>
  );
}
