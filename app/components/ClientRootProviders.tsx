import type { ReactNode } from "react";
import { ActiveCompanyProvider } from "./ActiveCompanyProvider";
import { AuthGate } from "./auth/AuthGate";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./ThemeProvider";
import { Toaster } from "./Toaster";

/**
 * Theme + Auth + ActiveCompany + AuthGate + Toaster.
 * Server auth: middleware.ts (unchanged). Client backup: AuthGate.
 */
export function ClientRootProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ActiveCompanyProvider>
          <AuthGate>{children}</AuthGate>
          <Toaster />
        </ActiveCompanyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
