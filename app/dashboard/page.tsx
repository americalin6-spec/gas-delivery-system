"use client";

import dynamic from "next/dynamic";
import { DashboardLoadingScreen } from "../components/dashboard/DashboardLoadingScreen";

const DashboardPageClient = dynamic(() => import("./DashboardPageClient"), {
  ssr: false,
  loading: () => <DashboardLoadingScreen message="正在載入儀表板…" />,
});

/** Authenticated CRM home — client-only to avoid SSR browser API crashes on Vercel. */
export default function DashboardPage() {
  return <DashboardPageClient />;
}
