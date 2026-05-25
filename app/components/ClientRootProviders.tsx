"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ActiveCompanyProvider } from "./ActiveCompanyProvider";
import { AuthGate } from "./auth/AuthGate";
import { AuthLoadingScreen } from "./auth/AuthLoadingScreen";
import { AuthenticatedCrmShell } from "./AuthenticatedCrmShell";
import { isPublicPath } from "../lib/authRoutes";

/**
 * Marketing routes (/, /login, /pricing, …) must not mount tenant providers
 * or CRM chrome — prevents stale localStorage company id from querying customers.
 */
export function ClientRootProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pathReady = pathname != null && pathname.length > 0;
  const isPublicMarketing = pathReady && isPublicPath(pathname);

  if (!pathReady) {
    return <AuthLoadingScreen />;
  }

  if (isPublicMarketing) {
    return <>{children}</>;
  }

  return (
    <ActiveCompanyProvider>
      <AuthGate>
        <AuthenticatedCrmShell>{children}</AuthenticatedCrmShell>
      </AuthGate>
    </ActiveCompanyProvider>
  );
}
