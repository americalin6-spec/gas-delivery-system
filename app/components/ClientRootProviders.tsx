import type { ReactNode } from "react";
import { ActiveCompanyProvider } from "./ActiveCompanyProvider";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./ThemeProvider";
import { Toaster } from "./Toaster";

/**
 * Theme + Auth + ActiveCompany + Toaster (hydration isolation test).
 * No AuthGate, AuthenticatedCrmShell, or client redirects.
 */
export function ClientRootProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ActiveCompanyProvider>
          {children}
          <Toaster />
        </ActiveCompanyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
