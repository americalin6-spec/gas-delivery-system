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
  getClientCompanyId,
  logActiveCompany,
  setClientCompanyId as persistCompanyId,
} from "../lib/clientCompany";

export type ActiveCompanyContextValue = {
  /** Active tenant id from localStorage (after hydration). */
  companyId: number;
  /** False until client has read localStorage — do not query customers before this. */
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

    const id = getClientCompanyId();
    setCompanyId(id);
    setReady(true);
    logActiveCompany("provider.hydrated", { companyId: id });

    function syncFromStorage() {
      if (!session?.user) return;
      const next = getClientCompanyId();
      setCompanyId(next);
      logActiveCompany("provider.sync", { companyId: next });
    }

    window.addEventListener("crm:companyChanged", syncFromStorage);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener("crm:companyChanged", syncFromStorage);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, [authLoading, session]);

  const setActiveCompanyId = useCallback((id: number) => {
    persistCompanyId(id);
    setCompanyId(id);
    logActiveCompany("provider.setActiveCompanyId", { companyId: id });
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
