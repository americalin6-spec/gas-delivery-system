"use client";

import type { ReactNode } from "react";

/**
 * @deprecated CRM chrome is mounted via AuthenticatedCrmShell on protected routes only.
 * Kept as a passthrough so stale imports never mount global notification polling.
 */
export function CrmAppChrome({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
