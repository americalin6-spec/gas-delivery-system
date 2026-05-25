import type { ReactNode } from "react";
import { Toaster } from "./Toaster";

/**
 * Passthrough + Toaster only (hydration isolation test).
 * No Auth/Theme/CRM providers.
 */
export function ClientRootProviders({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
