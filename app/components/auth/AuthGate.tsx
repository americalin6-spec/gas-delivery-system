"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuthSession } from "../../hooks/useAuthSession";
import { HOME_PATH, isProtectedPath } from "../../lib/authRoutes";
import { AuthLoadingScreen } from "./AuthLoadingScreen";

/**
 * Protects internal routes: unauthenticated users are sent to the public homepage.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, loading } = useAuthSession();

  const protectedRoute = isProtectedPath(pathname ?? "");

  useEffect(() => {
    if (loading || !protectedRoute) return;
    if (!session) {
      router.replace(HOME_PATH);
    }
  }, [loading, protectedRoute, session, router]);

  if (!protectedRoute) {
    return <>{children}</>;
  }

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (!session) {
    return <AuthLoadingScreen />;
  }

  return <>{children}</>;
}
