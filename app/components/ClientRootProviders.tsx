import type { ReactNode } from "react";
import { ThemeProvider } from "./ThemeProvider";
import { Toaster } from "./Toaster";

/**
 * Passthrough + ThemeProvider + Toaster (hydration isolation test).
 * No Auth/CRM providers.
 */
export function ClientRootProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
