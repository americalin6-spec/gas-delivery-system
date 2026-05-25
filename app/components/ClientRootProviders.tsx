import type { ReactNode } from "react";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./ThemeProvider";
import { Toaster } from "./Toaster";

/**
 * Theme + Auth + Toaster only (hydration isolation test).
 * No CRM providers or client redirects.
 */
export function ClientRootProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        {children}
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  );
}
