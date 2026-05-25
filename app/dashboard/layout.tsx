import type { ReactNode } from "react";

/** Bare layout — no hooks, no CRM shell. Auth is enforced by middleware. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
