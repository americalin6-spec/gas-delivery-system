"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { CopyWithFallbackOptions } from "../hooks/useCopyWithFallback";
import { companyIdHeader } from "../lib/clientCompany";
import { customerStatusWritePayload } from "../lib/customerStatus";
import {
  FOLLOW_UP_URGENCY_THEME,
  formatAiSummaryUpdatedAt,
  type CustomerAiFollowUp,
  type FollowUpUrgencyLevel,
} from "../lib/customerAiFollowUp";
import { supabase } from "../../supabase";

type CustomerSnapshot = {
  id: string | number;
  note?: string | null;
};

type Props = {
  customerId: string;
  companyId: number;
  customer: CustomerSnapshot;
  conversationSourceText: string;
  isMobile: boolean;
  refreshSignal?: number;
  copyWithFallback: (text: string, options?: CopyWithFallbackOptions) => Promise<boolean>;
  showToast: (message: string) => void;
  onCustomerUpdated: () => void;
};

const shell = {
  bg: "linear-gradient(155deg, rgba(16,185,129,0.12) 0%, rgba(15,23,42,0.94) 45%, rgba(12,18,34,0.98) 100%)",
  border: "1px solid rgba(52,211,153,0.32)",
  shadow: "0 1px 0 rgba(255,255,255,0.06) inset, 0 20px 50px rgba(0,0,0,0.38)",
  radius: 18,
  text: "#f8fafc",
  muted: "#94a3b8",
  faint: "#64748b",
};

const FIELD_CARDS: {
  key: keyof Pick<
    CustomerAiFollowUp,
    "suggestedFollowUpTime" | "suggestedMessage" | "suggestedAction" | "closingStrategy"
  >;
  title: string;
  highlight?: boolean;
}[] = [
  { key: "suggestedFollowUpTime", title: "建議跟進時間" },
  { key: "suggestedMessage", title: "建議訊息", highlight: true },
  { key: "suggestedAction", title: "建議行動" },
  { key: "closingStrategy", title: "建議成交策略" },
];

export function CustomerAiFollowUpSection({
  customerId,
  companyId,
  customer,
  conversationSourceText,
  isMobile,
  refreshSignal = 0,
  copyWithFallback,
  showToast,
  onCustomerUpdated,
}: Props) {
  const [followUp, setFollowUp] = useState<CustomerAiFollowUp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadFollowUp = useCallback(async () => {
    if (!customerId || !companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/customers/ai-follow-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...companyIdHeader(),
        },
        body: JSON.stringify({
          customer_id: customerId,
          conversation_text: conversationSourceText || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        followUp?: CustomerAiFollowUp;
      };
      if (!res.ok || !data.ok || !data.followUp) {
        throw new Error(data.error || "無法取得 AI 跟進建議");
      }
      setFollowUp(data.followUp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 跟進分析失敗");
      setFollowUp(null);
    } finally {
      setLoading(false);
    }
  }, [customerId, companyId, conversationSourceText]);

  useEffect(() => {
    void loadFollowUp();
  }, [loadFollowUp, refreshSignal]);

  const urgency: FollowUpUrgencyLevel = followUp?.urgencyLevel ?? "medium";
  const urgencyTheme = FOLLOW_UP_URGENCY_THEME[urgency];

  async function handleCopyMessage() {
    const msg = followUp?.suggestedMessage?.trim();
    if (!msg) {
      showToast("尚無建議訊息可複製");
      return;
    }
    const ok = await copyWithFallback(msg, { title: "建議訊息" });
    showToast(ok ? "已複製建議訊息" : "複製失敗，請手動選取");
  }

  async function handleAppendNote() {
    const msg = followUp?.suggestedMessage?.trim();
    if (!msg) {
      showToast("尚無建議訊息可加入備註");
      return;
    }
    setActionBusy("note");
    const stamp = new Date().toLocaleString("zh-TW", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const block = `[AI 跟進 ${stamp}]\n${msg}`;
    const existing = customer.note?.trim() ?? "";
    const nextNote = existing ? `${existing}\n\n${block}` : block;

    const { error: updateError } = await supabase
      .from("customers")
      .update({ note: nextNote })
      .eq("id", customerId)
      .eq("company_id", companyId);

    setActionBusy(null);
    if (updateError) {
      showToast(`加入備註失敗：${updateError.message}`);
      return;
    }
    showToast("已加入備註");
    onCustomerUpdated();
  }

  async function handleMarkPending() {
    if (!followUp) {
      showToast("請先完成 AI 分析");
      return;
    }
    setActionBusy("pending");
    const payload: Record<string, unknown> = {
      ...customerStatusWritePayload("waiting_reply"),
      follow_up: followUp.suggestedMessage,
      next_step: followUp.suggestedAction,
      urgent: urgency === "high",
    };

    const { error: updateError } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", customerId)
      .eq("company_id", companyId);

    setActionBusy(null);
    if (updateError) {
      showToast(`標記失敗：${updateError.message}`);
      return;
    }
    showToast("已標記為待跟進");
    onCustomerUpdated();
  }

  return (
    <section
      aria-label="AI 跟進建議"
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
                background: "linear-gradient(135deg, #34d399, #10b981)",
                boxShadow: "0 0 12px rgba(52,211,153,0.75)",
              }}
            />
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#6ee7b7",
                fontWeight: 600,
              }}
            >
              AI 跟進助理
            </span>
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 18 : 20,
              fontWeight: 600,
              color: shell.text,
              letterSpacing: "-0.02em",
            }}
          >
            AI 跟進建議
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: shell.muted, lineHeight: 1.5 }}>
            依對話、情緒、成交機率與客戶狀態自動產出跟進方案
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 10px",
              borderRadius: 999,
              background: `${urgencyTheme.accent}18`,
              color: urgencyTheme.accent,
              border: `1px solid ${urgencyTheme.border}`,
            }}
          >
            {urgencyTheme.label}
          </span>
          {followUp?.reEngagement ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: 999,
                background: "rgba(251,191,36,0.12)",
                color: "#fcd34d",
                border: "1px solid rgba(251,191,36,0.4)",
              }}
            >
              喚回建議
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void loadFollowUp()}
            disabled={loading}
            style={ghostBtnStyle(loading)}
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
            fontSize: 13,
          }}
        >
          {error}
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          gap: isMobile ? 10 : 12,
        }}
      >
        {FIELD_CARDS.map((item) => {
          const value = followUp?.[item.key] ?? (loading ? "…" : "—");
          const isMessage = item.key === "suggestedMessage";
          return (
            <article
              key={item.key}
              style={{
                gridColumn: isMessage && !isMobile ? "1 / -1" : undefined,
                borderRadius: 14,
                border: `1px solid ${item.highlight ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.1)"}`,
                background: item.highlight
                  ? `linear-gradient(160deg, ${urgencyTheme.glow} 0%, rgba(15,23,42,0.8) 100%)`
                  : "rgba(255,255,255,0.03)",
                padding: isMobile ? "12px" : "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: item.highlight ? "#6ee7b7" : "#cbd5e1",
                }}
              >
                {item.title}
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: isMessage ? 14 : 13,
                  lineHeight: 1.6,
                  color: loading && !followUp ? shell.faint : "#e2e8f0",
                  whiteSpace: "pre-wrap",
                }}
              >
                {value}
              </p>
            </article>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <button
          type="button"
          disabled={!followUp?.suggestedMessage || actionBusy != null}
          onClick={() => void handleCopyMessage()}
          style={primaryBtnStyle(isMobile)}
        >
          複製訊息
        </button>
        <button
          type="button"
          disabled={!followUp?.suggestedMessage || actionBusy != null}
          onClick={() => void handleAppendNote()}
          style={ghostBtnStyle(actionBusy === "note")}
        >
          {actionBusy === "note" ? "處理中…" : "加入備註"}
        </button>
        <button
          type="button"
          disabled={!followUp || actionBusy != null}
          onClick={() => void handleMarkPending()}
          style={ghostBtnStyle(actionBusy === "pending")}
        >
          {actionBusy === "pending" ? "處理中…" : "標記待跟進"}
        </button>
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
        <span style={{ fontSize: 12, color: shell.faint }}>
          AI 分析更新時間
          {followUp?.updatedAt ? (
            <strong style={{ color: shell.muted, fontWeight: 500, marginLeft: 6 }}>
              {formatAiSummaryUpdatedAt(followUp.updatedAt)}
            </strong>
          ) : loading ? (
            <span style={{ marginLeft: 6 }}>分析中…</span>
          ) : (
            <span style={{ marginLeft: 6 }}>—</span>
          )}
        </span>
        <span style={{ fontSize: 11, color: shell.faint }}>
          快捷操作會更新 CRM 備註或跟進狀態
        </span>
      </footer>
    </section>
  );
}

function primaryBtnStyle(isMobile: boolean): CSSProperties {
  return {
    padding: isMobile ? "10px 14px" : "9px 16px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #10b981, #059669)",
    color: "#ecfdf5",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function ghostBtnStyle(disabled: boolean): CSSProperties {
  return {
    padding: "9px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#f8fafc",
    fontSize: 13,
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
