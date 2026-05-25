"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ActiveCompanyProvider } from "./ActiveCompanyProvider";
import { AuthenticatedCrmShell } from "./AuthenticatedCrmShell";
import { AuthGate } from "./auth/AuthGate";
import { AuthLoadingScreen } from "./auth/AuthLoadingScreen";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./ThemeProvider";
import { Toaster } from "./Toaster";
import { requiresCrmAuthLayout } from "../lib/authRoutes";

/**
 * Public routes: theme + auth only — no tenant/CRM chrome.
 * Protected CRM routes (/dashboard, /customers, …): full stack + AuthGate.
 */
export function ClientRootProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pathReady = pathname != null && pathname.length > 0;
  const requiresAuth = pathReady ? requiresCrmAuthLayout(pathname) : true;

  if (!pathReady) {
    return <AuthLoadingScreen />;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        {!requiresAuth ? (
          children
        ) : (
          <ActiveCompanyProvider>
            <AuthGate>
              <AuthenticatedCrmShell>{children}</AuthenticatedCrmShell>
            </AuthGate>
            <Toaster />
          </ActiveCompanyProvider>
        )}
      </AuthProvider>
    </ThemeProvider>
  );
}
