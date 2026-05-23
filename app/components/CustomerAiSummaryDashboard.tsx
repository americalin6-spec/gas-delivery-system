"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterAiRun } from "../hooks/useRegisterAiRun";
import {
  postAiCustomerEndpoint,
  shouldSkipDuplicateAiRequest,
} from "../lib/aiCustomerFetchClient";
import {
  DEAL_PRIORITY_THEME,
  RISK_PRIORITY_THEME,
  formatAiSummaryUpdatedAt,
  type CustomerAiSummary,
  type DealPriorityLevel,
  type RiskPriorityLevel,
} from "../lib/customerAiSummary";
import { localizeCrmDisplayText } from "../lib/crmAiDisplayLabels";
import { dt } from "../lib/customerDetailTypography";

export type CustomerAiExtractPayload = {
  updatedColumns?: string[];
  extractedAt?: string | null;
  extractedSocial?: Record<string, string>;
  savedFields?: string[];
  skippedFields?: { column: string; reason: string }[];
  ok?: boolean;
};

type Props = {
  customerId: string;
  companyId: number;
  conversationSourceText: string;
  isMobile: boolean;
  /** Parent stores runner — only invoked on user refresh or explicit parent trigger. */
  registerRun?: (run: (() => Promise<void>) | null) => void;
  onExtractComplete?: (extract: CustomerAiExtractPayload | null) => void;
};

const CARD_ITEMS: {
  key: keyof Pick<
    CustomerAiSummary,
    | "customerNeeds"
    | "painPoints"
    | "dealProbability"
    | "customerEmotion"
    | "suggestedNextStep"
    | "riskAlert"
  >;
  title: string;
  icon: string;
  priority?: "deal" | "risk";
}[] = [
  { key: "customerNeeds", title: "客戶需求", icon: "◆" },
  { key: "painPoints", title: "客戶痛點", icon: "◇" },
  { key: "dealProbability", title: "成交機率", icon: "◎", priority: "deal" },
  { key: "customerEmotion", title: "客戶情緒", icon: "○" },
  { key: "suggestedNextStep", title: "建議下一步", icon: "→" },
  { key: "riskAlert", title: "風險提醒", icon: "!", priority: "risk" },
];

const shell = {
  bg: "linear-gradient(155deg, rgba(99,102,241,0.14) 0%, rgba(15,23,42,0.92) 48%, rgba(12,18,34,0.98) 100%)",
  border: "1px solid rgba(129,140,248,0.28)",
  shadow: "0 1px 0 rgba(255,255,255,0.06) inset, 0 20px 50px rgba(0,0,0,0.38)",
  radius: 18,
  text: "#f8fafc",
  muted: "#94a3b8",
  faint: "#64748b",
};

function cardAccent(
  priority: "deal" | "risk" | undefined,
  dealLevel: DealPriorityLevel,
  riskLevel: RiskPriorityLevel,
): { border: string; glow: string; badge?: string; badgeColor?: string } {
  if (priority === "deal") {
    const t = DEAL_PRIORITY_THEME[dealLevel];
    return {
      border: t.border,
      glow: t.glow,
      badge: t.label,
      badgeColor: t.accent,
    };
  }
  if (priority === "risk") {
    const t = RISK_PRIORITY_THEME[riskLevel];
    return {
      border: t.border,
      glow: t.glow,
      badge: t.label,
      badgeColor: t.accent,
    };
  }
  return {
    border: "rgba(255,255,255,0.1)",
    glow: "rgba(255,255,255,0.04)",
  };
}

export function CustomerAiSummaryDashboard({
  customerId,
  companyId,
  conversationSourceText,
  isMobile,
  registerRun,
  onExtractComplete,
}: Props) {
  const [summary, setSummary] = useState<CustomerAiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onExtractRef = useRef(onExtractComplete);
  onExtractRef.current = onExtractComplete;
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const conversationTextRef = useRef(conversationSourceText);
  conversationTextRef.current = conversationSourceText;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const loadSummary = useCallback(async () => {
    if (!customerId || !companyId) return;
    if (shouldSkipDuplicateAiRequest(inFlightRef.current, "summary")) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await postAiCustomerEndpoint<{
        summary?: CustomerAiSummary;
        extract?: CustomerAiExtractPayload | null;
      }>({
        kind: "summary",
        endpoint: "/api/customers/ai-summary",
        signal: controller.signal,
        body: {
          customer_id: customerId,
          conversation_text: conversationTextRef.current || undefined,
        },
      });

      if (!mountedRef.current) return;
      if (result.ok === false) {
        if (result.aborted || result.error === "aborted") return;
        setError(result.error);
        setSummary(null);
        return;
      }

      const data = result.data;
      if (!data.summary) {
        setError("無法取得 AI 分析");
        setSummary(null);
        return;
      }
      setSummary(data.summary);
      onExtractRef.current?.(data.extract ?? null);
    } finally {
      if (mountedRef.current) setLoading(false);
      inFlightRef.current = false;
    }
  }, [customerId, companyId]);

  useRegisterAiRun(registerRun, loadSummary);

  const dealLevel = summary?.dealLevel ?? "medium";
  const riskLevel = summary?.riskLevel ?? "normal";

  return (
    <section
      aria-label="AI 客戶洞察"
      style={{
        borderRadius: shell.radius,
        border: shell.border,
        background: shell.bg,
        boxShadow: shell.shadow,
        padding: isMobile ? "16px 14px" : "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: isMobile ? 14 : 18,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 200px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #818cf8, #a78bfa)",
                boxShadow: "0 0 12px rgba(129,140,248,0.8)",
              }}
            />
            <span
              style={{
                fontSize: dt.small,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#a5b4fc",
                fontWeight: 600,
              }}
            >
              AI 客戶洞察
            </span>
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? dt.cardTitleMobile : dt.cardTitle,
              fontWeight: 600,
              color: shell.text,
              letterSpacing: "-0.02em",
            }}
          >
            智能摘要儀表板
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: dt.meta,
              color: shell.muted,
              lineHeight: dt.lineHeight,
            }}
          >
            綜合 LINE 對話、備註與 CRM 資料
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
          }}
        >
          <PriorityPill
            label={DEAL_PRIORITY_THEME[dealLevel].label}
            color={DEAL_PRIORITY_THEME[dealLevel].accent}
          />
          {riskLevel === "high" ? (
            <PriorityPill
              label={RISK_PRIORITY_THEME.high.label}
              color={RISK_PRIORITY_THEME.high.accent}
            />
          ) : null}
          <button
            type="button"
            onClick={() => void loadSummary()}
            disabled={loading}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: shell.text,
              fontSize: 13,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "分析中…" : "重新分析"}
          </button>
        </div>
      </div>

      {error ? (
        <p
          style={{
            margin: 0,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(248,113,113,0.12)",
            border: "1px solid rgba(248,113,113,0.35)",
            color: "#fecaca",
            fontSize: dt.meta,
            lineHeight: dt.lineHeight,
          }}
        >
          {error}
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "repeat(auto-fill, minmax(260px, 1fr))",
          gap: isMobile ? 10 : 12,
        }}
      >
        {CARD_ITEMS.map((item) => {
          const accent = cardAccent(item.priority, dealLevel, riskLevel);
          const rawBody = summary?.[item.key] ?? (loading ? "…" : "—");
          const body =
            typeof rawBody === "string" ? localizeCrmDisplayText(rawBody) : rawBody;
          return (
            <article
              key={item.key}
              style={{
                borderRadius: 14,
                border: `1px solid ${accent.border}`,
                background: `linear-gradient(160deg, ${accent.glow} 0%, rgba(15,23,42,0.75) 100%)`,
                padding: isMobile ? "12px 12px" : "14px 16px",
                minHeight: isMobile ? 0 : 120,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: dt.label,
                    fontWeight: 600,
                    color: "#c7d2fe",
                    letterSpacing: "0.04em",
                  }}
                >
                  <span style={{ marginRight: 6, opacity: 0.7 }}>{item.icon}</span>
                  {item.title}
                </span>
                {accent.badge ? (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: `${accent.badgeColor}22`,
                      color: accent.badgeColor,
                      border: `1px solid ${accent.badgeColor}55`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {accent.badge}
                  </span>
                ) : null}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: dt.paragraph,
                  lineHeight: dt.lineHeightBody,
                  color: loading && !summary ? shell.faint : "#e2e8f0",
                  whiteSpace: "pre-wrap",
                }}
              >
                {body}
              </p>
            </article>
          );
        })}
      </div>

      <footer
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          paddingTop: 4,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span style={{ fontSize: dt.meta, color: shell.faint }}>
          AI 分析更新時間
          {summary?.updatedAt ? (
            <strong style={{ color: shell.muted, fontWeight: 500, marginLeft: 6 }}>
              {formatAiSummaryUpdatedAt(summary.updatedAt)}
            </strong>
          ) : loading ? (
            <span style={{ marginLeft: 6 }}>分析中…</span>
          ) : (
            <span style={{ marginLeft: 6 }}>—</span>
          )}
        </span>
        <span style={{ fontSize: dt.small, color: shell.faint }}>
          僅供決策參考 · 不修改 CRM 資料
        </span>
      </footer>
    </section>
  );
}

function PriorityPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "5px 10px",
        borderRadius: 999,
        background: `${color}18`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {label}
    </span>
  );
}
