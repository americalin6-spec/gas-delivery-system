import type { ReactNode } from "react";
import { ActiveCompanyProvider } from "./ActiveCompanyProvider";
import { AuthenticatedCrmShell } from "./AuthenticatedCrmShell";
import { AuthGate } from "./auth/AuthGate";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./ThemeProvider";
import { Toaster } from "./Toaster";

/**
 * Theme + Auth + ActiveCompany + AuthGate + AuthenticatedCrmShell + Toaster.
 * Server auth: middleware.ts (unchanged). Client backup: AuthGate.
 */
export function ClientRootProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ActiveCompanyProvider>
          <AuthGate>
            <AuthenticatedCrmShell>{children}</AuthenticatedCrmShell>
          </AuthGate>
          <Toaster />
        </ActiveCompanyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
