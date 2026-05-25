import type { ReactNode } from "react";

/**
 * Temporary passthrough — all CRM/auth providers disabled for React #310 isolation.
 * Restore hooks and providers after root cause is confirmed.
 */
export function ClientRootProviders({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
