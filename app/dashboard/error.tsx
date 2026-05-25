"use client";

import { DashboardTenantSetupMessage } from "../components/dashboard/DashboardTenantSetupMessage";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[dashboard] page error:", error);
  return (
    <DashboardTenantSetupMessage
      error={error.message || "儀表板載入時發生錯誤"}
      onRetry={reset}
    />
  );
}
