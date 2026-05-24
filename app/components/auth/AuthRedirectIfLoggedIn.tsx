"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuthSession } from "../../hooks/useAuthSession";
import { DASHBOARD_PATH } from "../../lib/authRoutes";
import { AuthLoadingScreen } from "./AuthLoadingScreen";

/** On login/signup pages — skip form when already authenticated. */
export function AuthRedirectIfLoggedIn({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { session, loading } = useAuthSession();

  useEffect(() => {
    if (!loading && session) {
      router.replace(DASHBOARD_PATH);
    }
  }, [loading, session, router]);

  if (loading || session) {
    return <AuthLoadingScreen />;
  }

  return <>{children}</>;
}
