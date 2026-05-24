"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

type UsagePayload = {
  planStatusLabel: string;
  trialDaysRemaining: number | null;
  usedThisMonth: number;
  remainingThisMonth: number;
  monthlyLimit: number;
};

type Props = {
  tenantReady: boolean;
  activeCompanyId: number;
  isMobile: boolean;
  cardStyle?: CSSProperties;
  cardTitleStyle?: CSSProperties;
  cardValueStyle?: CSSProperties;
  cardsGridStyle?: CSSProperties;
};

function formatTrialDays(days: number | null): string {
  if (days === null) return "—";
  if (days <= 0) return "0 天";
  return `${days} 天`;
}

export function CompanyAiUsagePanel({
  tenantReady,
  activeCompanyId,
  isMobile,
  cardStyle,
  cardTitleStyle,
  cardValueStyle,
  cardsGridStyle,
}: Props) {
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantReady || activeCompanyId <= 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/company/ai-usage", {
        credentials: "include",
        cache: "no-store",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        usage?: UsagePayload;
      };
      if (res.ok && body.ok && body.usage) {
        setUsage(body.usage);
      } else {
        setUsage(null);
      }
    } catch {
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, [tenantReady, activeCompanyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const gridStyle: CSSProperties = cardsGridStyle ?? {
    marginTop: isMobile ? 16 : 24,
    display: isMobile ? "flex" : "grid",
    flexDirection: isMobile ? "column" : undefined,
    gridTemplateColumns: isMobile ? undefined : "repeat(4, minmax(0, 1fr))",
    gap: isMobile ? 12 : 22,
  };

  const card = cardStyle ?? {
    background: "#20334d",
    borderRadius: 20,
    padding: isMobile ? 18 : 22,
  };

  const title = cardTitleStyle ?? { opacity: 0.85, fontSize: isMobile ? 14 : 15 };
  const value = cardValueStyle ?? {
    marginTop: 8,
    fontSize: isMobile ? 24 : 28,
    fontWeight: 700,
    margin: "8px 0 0",
  };

  const placeholder = loading && !usage ? "…" : "—";

  return (
    <section style={gridStyle} aria-label="AI 方案與用量">
      <div style={card}>
        <div style={title}>方案狀態</div>
        <div style={value}>{usage?.planStatusLabel ?? placeholder}</div>
      </div>
      <div style={card}>
        <div style={title}>免費試用剩餘天數</div>
        <div style={value}>
          {usage ? formatTrialDays(usage.trialDaysRemaining) : placeholder}
        </div>
      </div>
      <div style={card}>
        <div style={title}>本月 AI 使用次數</div>
        <div style={value}>
          {usage != null ? `${usage.usedThisMonth} / ${usage.monthlyLimit}` : placeholder}
        </div>
      </div>
      <div style={card}>
        <div style={title}>本月剩餘次數</div>
        <div style={value}>
          {usage != null ? String(usage.remainingThisMonth) : placeholder}
        </div>
      </div>
    </section>
  );
}
