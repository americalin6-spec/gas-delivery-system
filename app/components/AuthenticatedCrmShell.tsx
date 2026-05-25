import type { ReactNode } from "react";

/**
 * CRM shell wrapper (hydration isolation test).
 * TenantBootstrap and CrmNotificationBell omitted — children only.
 */
export function AuthenticatedCrmShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
