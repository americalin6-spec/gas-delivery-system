"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  parseAiQuotaUpgradeFromBody,
  type AiQuotaUpgradeFlow,
} from "../lib/aiQuotaUpgrade";
import { AiQuotaUpgradeModal } from "./AiQuotaUpgradeModal";

type AiQuotaUpgradeContextValue = {
  showUpgradeFlow: (flow: AiQuotaUpgradeFlow) => void;
  handleQuotaApiBody: (body: unknown) => boolean;
};

const AiQuotaUpgradeContext = createContext<AiQuotaUpgradeContextValue | null>(null);

export function AiQuotaUpgradeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<AiQuotaUpgradeFlow | null>(null);

  const showUpgradeFlow = useCallback((nextFlow: AiQuotaUpgradeFlow) => {
    setFlow(nextFlow);
    setOpen(true);
  }, []);

  const handleQuotaApiBody = useCallback(
    (body: unknown) => {
      const upgradeFlow = parseAiQuotaUpgradeFromBody(body);
      if (!upgradeFlow) return false;
      showUpgradeFlow(upgradeFlow);
      return true;
    },
    [showUpgradeFlow],
  );

  const value = useMemo(
    () => ({ showUpgradeFlow, handleQuotaApiBody }),
    [handleQuotaApiBody, showUpgradeFlow],
  );

  return (
    <AiQuotaUpgradeContext.Provider value={value}>
      {children}
      <AiQuotaUpgradeModal open={open} flow={flow} onClose={() => setOpen(false)} />
    </AiQuotaUpgradeContext.Provider>
  );
}

export function useAiQuotaUpgrade(): AiQuotaUpgradeContextValue {
  const ctx = useContext(AiQuotaUpgradeContext);
  if (!ctx) {
    throw new Error("useAiQuotaUpgrade must be used within AiQuotaUpgradeProvider");
  }
  return ctx;
}
