"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useActiveCompany } from "../ActiveCompanyProvider";
import { useAuthSession } from "../../hooks/useAuthSession";
import { isPublicPath } from "../../lib/authRoutes";
import { setClientCompanyId } from "../../lib/clientCompany";

/**
 * After login, sync active company from server bootstrap (never localStorage default).
 */
export function TenantBootstrap() {
  const pathname = usePathname();
  const { session, loading: authLoading } = useAuthSession();
  const { setActiveCompanyId } = useActiveCompany();

  useEffect(() => {
    if (authLoading || !session?.user) return;
    if (pathname && isPublicPath(pathname)) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/tenant/bootstrap", {
          method: "POST",
          credentials: "include",
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          companyId?: number;
          error?: string;
        };

        if (!res.ok || !body.ok || !body.companyId) {
          console.error(
            "[TenantBootstrap] bootstrap failed:",
            body.error ?? res.status,
          );
          return;
        }

        if (cancelled) return;

        const serverCompanyId = Number(body.companyId);
        if (!Number.isFinite(serverCompanyId) || serverCompanyId <= 0) return;

        console.log("[TenantBootstrap] active company from server:", {
          authUserId: session.user.id,
          activeCompanyId: serverCompanyId,
        });

        setClientCompanyId(serverCompanyId);
        setActiveCompanyId(serverCompanyId);
      } catch (err) {
        console.error("[TenantBootstrap] bootstrap request failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, pathname, session, setActiveCompanyId]);

  return null;
}
