"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthSession } from "./useAuthSession";

export type ServerTenantState = {
  /** True after bootstrap attempt finishes (success or failure). */
  ready: boolean;
  activeCompanyId: number;
  activeWorkspaceId: number;
  authUserId: string | null;
  error: string | null;
  created: boolean;
  refresh: () => Promise<void>;
};

/**
 * Resolve active tenant from server bootstrap only (never localStorage / defaults).
 */
export function useServerTenant(): ServerTenantState {
  const { session, loading: authLoading } = useAuthSession();
  const [ready, setReady] = useState(false);
  const [activeCompanyId, setActiveCompanyId] = useState(0);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(0);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setReady(true);
      setActiveCompanyId(0);
      setActiveWorkspaceId(0);
      setAuthUserId(null);
      setError(null);
      setCreated(false);
      return;
    }

    setReady(false);
    setError(null);

    try {
      const res = await fetch("/api/tenant/bootstrap", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        companyId?: number;
        workspaceId?: number;
        created?: boolean;
        error?: string;
      };

      if (!res.ok || !body.ok || !body.companyId) {
        const message = body.error ?? `bootstrap failed (${res.status})`;
        console.error("[useServerTenant] bootstrap failed:", message);
        setActiveCompanyId(0);
        setActiveWorkspaceId(0);
        setAuthUserId(session.user.id);
        setCreated(false);
        setError(message);
        setReady(true);
        return;
      }

      const companyId = Number(body.companyId);
      const workspaceId = Number(body.workspaceId ?? body.companyId);
      if (!Number.isFinite(companyId) || companyId <= 0) {
        setError("invalid companyId from bootstrap");
        setActiveCompanyId(0);
        setActiveWorkspaceId(0);
        setAuthUserId(session.user.id);
        setCreated(false);
        setReady(true);
        return;
      }

      if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
        setError("invalid workspaceId from bootstrap");
        setActiveCompanyId(0);
        setActiveWorkspaceId(0);
        setAuthUserId(session.user.id);
        setCreated(false);
        setReady(true);
        return;
      }

      console.log("[useServerTenant] bootstrap ok:", {
        authUserId: session.user.id,
        activeCompanyId: companyId,
        activeWorkspaceId: workspaceId,
        created: Boolean(body.created),
      });

      setActiveCompanyId(companyId);
      setActiveWorkspaceId(workspaceId);
      setAuthUserId(session.user.id);
      setCreated(Boolean(body.created));
      setError(null);
      setReady(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "bootstrap request failed";
      console.error("[useServerTenant]", message);
      setActiveCompanyId(0);
      setActiveWorkspaceId(0);
      setAuthUserId(session.user.id);
      setCreated(false);
      setError(message);
      setReady(true);
    }
  }, [session]);

  useEffect(() => {
    if (authLoading) return;
    if (!session?.user) {
      setReady(true);
      setActiveCompanyId(0);
      setActiveWorkspaceId(0);
      setAuthUserId(null);
      setError(null);
      setCreated(false);
      return;
    }
    void refresh();
  }, [authLoading, session, refresh]);

  return {
    ready,
    activeCompanyId,
    activeWorkspaceId,
    authUserId,
    error,
    created,
    refresh,
  };
}
