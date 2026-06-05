"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuthSession } from "../hooks/useAuthSession";
import {
  clearClientCompanyId,
  logActiveCompany,
  setClientCompanyId as persistCompanyIdForDisplay,
} from "../lib/clientCompany";

export type ActiveCompanyContextValue = {
  /** Active tenant id from server bootstrap only. */
  companyId: number;
  /** False until /api/tenant/bootstrap sets active company (or bootstrap completes with none). */
  ready: boolean;
  setActiveCompanyId: (id: number) => void;
};

const ActiveCompanyContext = createContext<ActiveCompanyContextValue | null>(null);

export function ActiveCompanyProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuthSession();
  const [companyId, setCompanyId] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (authLoading) {
      setReady(false);
      return;
    }

    if (!session?.user) {
      clearClientCompanyId();
      setCompanyId(0);
      setReady(true);
      logActiveCompany("provider.loggedOut", { companyId: 0 });
      return;
    }

    setCompanyId(0);
    setReady(false);
    logActiveCompany("provider.awaitingBootstrap", { companyId: 0 });
  }, [authLoading, session]);

  const setActiveCompanyId = useCallback((id: number) => {
    if (Number.isFinite(id) && id > 0) {
      persistCompanyIdForDisplay(id);
      setCompanyId(id);
      logActiveCompany("provider.setActiveCompanyId", { companyId: id });
    } else {
      setCompanyId(0);
      logActiveCompany("provider.bootstrapComplete", { companyId: 0 });
    }
    setReady(true);
  }, []);

  const value = useMemo(
    () => ({ companyId, ready, setActiveCompanyId }),
    [companyId, ready, setActiveCompanyId],
  );

  return (
    <ActiveCompanyContext.Provider value={value}>{children}</ActiveCompanyContext.Provider>
  );
}

export function useActiveCompany(): ActiveCompanyContextValue {
  const ctx = useContext(ActiveCompanyContext);
  if (!ctx) {
    throw new Error("useActiveCompany must be used within ActiveCompanyProvider");
  }
  return ctx;
}

/** Same id as useActiveCompany().companyId — for existing call sites. */
export function useCurrentCompanyId(): number {
  return useActiveCompany().companyId;
}
