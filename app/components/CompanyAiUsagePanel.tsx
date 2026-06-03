"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { PRICING_PATH } from "../lib/authRoutes";

type UsagePayload = {
  subscriptionPlanLabel: string;
  subscriptionStatus: string;
  remainingThisMonth: number;
  monthlyLimit: number;
  usedThisMonth: number;
};

const MONTHLY_USAGE_LABELS = {
  used: "本月已使用 AI 分析次數",
  limit: "本月可用 AI 分析次數",
  remaining: "剩餘次數",
} as const;

const TRIAL_USAGE_LABELS = {
  used: "免費試用已使用次數",
  limit: "免費試用總額度",
  remaining: "剩餘次數",
} as const;

function usageCardLabels(subscriptionStatus: string | undefined) {
  return subscriptionStatus === "trial" ? TRIAL_USAGE_LABELS : MONTHLY_USAGE_LABELS;
}

type Props = {
  tenantReady: boolean;
  activeCompanyId: number;
  isMobile: boolean;
  cardStyle?: CSSProperties;
  cardTitleStyle?: CSSProperties;
  cardValueStyle?: CSSProperties;
  cardsGridStyle?: CSSProperties;
};

function isUnlimitedLimit(limit: number): boolean {
  return limit >= 2147483647;
}

function formatLimit(limit: number): string {
  return isUnlimitedLimit(limit) ? "不限次數" : String(limit);
}

function formatRemaining(remaining: number, limit: number): string {
  return isUnlimitedLimit(limit) ? "不限次數" : String(remaining);
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
        usage?: UsagePayload & {
          planStatusLabel?: string;
        };
      };
      if (res.ok && body.ok && body.usage) {
        const u = body.usage;
        setUsage({
          subscriptionPlanLabel:
            u.subscriptionPlanLabel ?? u.planStatusLabel ?? "—",
          subscriptionStatus: u.subscriptionStatus ?? "",
          remainingThisMonth: u.remainingThisMonth ?? 0,
          monthlyLimit: u.monthlyLimit ?? 0,
          usedThisMonth: u.usedThisMonth ?? 0,
        });
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
    const onUsageRefresh = () => void load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("line-work-ai:ai-usage-refresh", onUsageRefresh);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("line-work-ai:ai-usage-refresh", onUsageRefresh);
    };
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
  const cardLabels = usageCardLabels(usage?.subscriptionStatus);

  return (
    <section aria-label="AI 分析用量">
      <div style={gridStyle}>
        <div style={card}>
          <div style={title}>{cardLabels.used}</div>
          <div style={value}>{usage?.usedThisMonth ?? placeholder}</div>
        </div>
        <div style={card}>
          <div style={title}>{cardLabels.limit}</div>
          <div style={value}>
            {usage != null ? formatLimit(usage.monthlyLimit) : placeholder}
          </div>
        </div>
        <div style={card}>
          <div style={title}>{cardLabels.remaining}</div>
          <div style={value}>
            {usage != null
              ? formatRemaining(usage.remainingThisMonth, usage.monthlyLimit)
              : placeholder}
          </div>
        </div>
        <div style={card}>
          <div style={title}>目前方案</div>
          <div style={value}>{usage?.subscriptionPlanLabel ?? placeholder}</div>
        </div>
      </div>
      <p style={{ margin: isMobile ? "12px 0 0" : "14px 0 0", fontSize: 14, opacity: 0.8 }}>
        <Link href={PRICING_PATH} style={{ color: "#a5b4fc", fontWeight: 600 }}>
          查看方案與升級
        </Link>
      </p>
    </section>
  );
}
