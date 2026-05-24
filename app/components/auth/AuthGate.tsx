"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuthSession } from "../../hooks/useAuthSession";
import {
  DASHBOARD_PATH,
  isProtectedPath,
  LOGIN_PATH,
} from "../../lib/authRoutes";
import { isInternalCrmRoute, showInternalCrmNav } from "../../lib/crmNavVisibility";
import { AuthLoadingScreen } from "./AuthLoadingScreen";

/**
 * Client-side guard (middleware is the primary gate).
 * Blocks protected UI until session is confirmed; redirects guests to /login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, loading } = useAuthSession();

  const pathReady = pathname != null && pathname.length > 0;
  const protectedRoute = pathReady ? isProtectedPath(pathname) : true;

  useEffect(() => {
    if (!pathReady || loading || !protectedRoute) return;
    if (!session) {
      const next = encodeURIComponent(pathname);
      router.replace(`${LOGIN_PATH}?next=${next}`);
      return;
    }
    if (isInternalCrmRoute(pathname) && !showInternalCrmNav()) {
      router.replace(DASHBOARD_PATH);
    }
  }, [pathReady, loading, protectedRoute, session, router, pathname]);

  if (!pathReady) {
    return <AuthLoadingScreen />;
  }

  if (!protectedRoute) {
    return <>{children}</>;
  }

  if (loading || !session) {
    return <AuthLoadingScreen />;
  }

  return <>{children}</>;
}
