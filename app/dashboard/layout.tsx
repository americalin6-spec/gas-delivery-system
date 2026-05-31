import type { ReactNode } from "react";
import { AiQuotaUpgradeProvider } from "../components/AiQuotaUpgradeProvider";

/** Bare layout - no hooks, no CRM shell. Auth is enforced by middleware. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AiQuotaUpgradeProvider>{children}</AiQuotaUpgradeProvider>;
}