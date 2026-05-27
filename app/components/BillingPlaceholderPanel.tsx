"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { PRICING_PATH } from "../lib/authRoutes";
import {
  formatAiRemainingDisplay,
  isSubscriptionExpiredForUx,
  isSubscriptionNearExpiration,
  subscriptionAccessLabel,
  subscriptionExpiryDateDisplay,
} from "../lib/billingSubscriptionUx";
import type { BillingSettingsSnapshot } from "../lib/billingSettings";

type SubscriptionSnapshot = {
  subscriptionPlan?: string;
  subscriptionPlanLabel?: string;
  subscriptionStatusLabel?: string;
  paidUntil?: string | null;
  trialEndsAt?: string | null;
  trialDaysRemaining?: number | null;
  aiRemainingThisMonth?: number;
  monthlyAiLimit?: number;
  hasActivePaidSubscription?: boolean;
  trialExpired?: boolean;
  stripeCustomerId?: string | null;
};

type BillingResponse = {
  ok?: boolean;
  billing?: {
    subscription?: SubscriptionSnapshot;
    settings?: BillingSettingsSnapshot;
    stripeConnected?: boolean;
    ecpayConfigured?: boolean;
  };
};

type Props = {
  isMobile?: boolean;
};

const shell: CSSProperties = {
  maxWidth: 560,
  marginTop: 24,
  background: "rgba(32, 51, 77, 0.85)",
  borderRadius: 16,
  padding: 24,
  border: "1px solid rgba(255,255,255,0.12)",
};

const actionBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

export function BillingPlaceholderPanel({ isMobile }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BillingResponse["billing"] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manageBusy, setManageBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing", { credentials: "include", cache: "no-store" });
      const body = (await res.json()) as BillingResponse;
      if (res.ok && body.ok && body.billing) {
        setData(body.billing);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sub = data?.subscription;

  const uxInput = useMemo(
    () => ({
      subscriptionPlan: sub?.subscriptionPlan ?? "trial",
      hasActivePaidSubscription: Boolean(sub?.hasActivePaidSubscription),
      trialExpired: Boolean(sub?.trialExpired),
      paidUntil: sub?.paidUntil ?? null,
      trialEndsAt: sub?.trialEndsAt ?? null,
    }),
    [sub],
  );

  const accessLabel = sub ? subscriptionAccessLabel(uxInput) : "—";
  const expired = sub ? isSubscriptionExpiredForUx(uxInput) : false;
  const nearExpiry = sub ? isSubscriptionNearExpiration(uxInput) : false;
  const expiryDate = sub ? subscriptionExpiryDateDisplay(uxInput) : "—";
  const aiRemaining =
    sub != null
      ? formatAiRemainingDisplay(
          sub.aiRemainingThisMonth ?? 0,
          sub.monthlyAiLimit ?? 0,
        )
      : "—";

  async function tryEcpayCheckout(plan: string) {
    setNotice(null);
    try {
      const res = await fetch("/api/ecpay/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan, payment_method: "credit_recurring" }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      setNotice(body.message ?? body.error ?? "ECPay 串接開發中");
    } catch {
      setNotice("無法連線至帳單服務");
    }
  }

  async function openManageSubscription() {
    setNotice(null);
    if (!data?.stripeConnected) {
      setNotice("金流尚未啟用，請使用「升級方案」查看可購買方案。");
      return;
    }
    setManageBusy(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (res.ok && body.ok && body.url) {
        window.location.href = body.url;
        return;
      }
      setNotice(body.error ?? "尚無法開啟訂閱管理，請稍後再試或聯絡客服。");
    } catch {
      setNotice("無法連線至帳單服務");
    } finally {
      setManageBusy(false);
    }
  }

  const settings = data?.settings;

  return (
    <section style={shell} aria-label="訂閱與帳單">
      <h2 style={{ margin: "0 0 8px", fontSize: isMobile ? 20 : 22, fontWeight: 800 }}>
        訂閱與帳單
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 14, opacity: 0.85, lineHeight: 1.55 }}>
        台灣市場預設使用綠界 ECPay 信用卡定期定額；海外方案保留 Stripe。目前為架構預留，尚未開放實際扣款。
      </p>

      {loading ? (
        <p style={{ opacity: 0.8 }}>載入中…</p>
      ) : (
        <>
          {expired ? (
            <div style={alertBoxExpired} role="alert">
              您的方案已到期
            </div>
          ) : nearExpiry ? (
            <div style={alertBoxNear} role="status">
              您的方案即將於 {expiryDate} 到期，請續訂以避免服務中斷。
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div style={statBox}>
              <div style={statLabel}>目前方案</div>
              <div style={statValue}>{sub?.subscriptionPlanLabel ?? "—"}</div>
            </div>
            <div style={statBox}>
              <div style={statLabel}>訂閱狀態</div>
              <div style={statValue}>{accessLabel}</div>
            </div>
            <div style={statBox}>
              <div style={statLabel}>到期日</div>
              <div style={statValue}>{expiryDate}</div>
            </div>
            <div style={statBox}>
              <div style={statLabel}>AI 剩餘次數</div>
              <div style={statValue}>{aiRemaining}</div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <button
              type="button"
              style={{ ...actionBtn, background: "#6366f1", color: "white" }}
              onClick={() => router.push(PRICING_PATH)}
            >
              升級方案
            </button>
            <button
              type="button"
              style={{
                ...actionBtn,
                background: "rgba(255,255,255,0.12)",
                color: "white",
                opacity: manageBusy ? 0.7 : 1,
              }}
              disabled={manageBusy}
              onClick={() => void openManageSubscription()}
            >
              {manageBusy ? "開啟中…" : "管理訂閱"}
            </button>
          </div>

          {settings ? (
            <>
              <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>
                付款通道（架構）
              </h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.65 }}>
                {settings.providers.map((p) => (
                  <li key={p.id}>
                    {p.labelZh} — {p.configured ? "已設定環境變數" : "未設定"}
                    <span style={{ opacity: 0.75 }}>（{p.noteZh}）</span>
                  </li>
                ))}
              </ul>

              <h3 style={{ margin: "20px 0 12px", fontSize: 16, fontWeight: 700 }}>
                定期定額方案
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {settings.recurringPlans.map((plan) => (
                  <div
                    key={plan.plan}
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(0,0,0,0.15)",
                    }}
                  >
                    <div style={statValue}>{plan.nameZh}</div>
                    <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                      {plan.priceLabelZh} · {plan.periodLabelZh} · 每月 {plan.aiMonthlyLimit}{" "}
                      次 AI
                    </div>
                    {plan.plan !== "enterprise" ? (
                      <button
                        type="button"
                        disabled
                        onClick={() => void tryEcpayCheckout(plan.plan)}
                        style={{
                          marginTop: 10,
                          padding: "8px 14px",
                          borderRadius: 10,
                          border: "none",
                          background: "rgba(129,140,248,0.35)",
                          color: "rgba(255,255,255,0.7)",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "not-allowed",
                        }}
                        title="ECPay API 尚未啟用"
                      >
                        升級（ECPay 開發中）
                      </button>
                    ) : (
                      <p style={{ margin: "10px 0 0", fontSize: 13, opacity: 0.75 }}>
                        請聯絡我們開通企業方案
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <p style={{ margin: "16px 0 0", fontSize: 13, opacity: 0.75 }}>
                回調路由預留：{settings.callbacks.payment}、{settings.callbacks.period}
              </p>
            </>
          ) : null}

          <p style={{ marginTop: 20, fontSize: 14 }}>
            <Link href={PRICING_PATH} style={{ color: "#93c5fd", fontWeight: 600 }}>
              查看完整方案定價
            </Link>
          </p>

          {notice ? (
            <p style={{ marginTop: 12, color: "#fde68a", fontSize: 14 }}>{notice}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

const statBox: CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(0,0,0,0.2)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const statLabel: CSSProperties = {
  fontSize: 13,
  opacity: 0.75,
};

const statValue: CSSProperties = {
  marginTop: 6,
  fontSize: 17,
  fontWeight: 700,
};

const alertBoxExpired: CSSProperties = {
  marginBottom: 16,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(239,68,68,0.2)",
  border: "1px solid rgba(248,113,113,0.45)",
  color: "#fecaca",
  fontSize: 14,
  fontWeight: 700,
};

const alertBoxNear: CSSProperties = {
  marginBottom: 16,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(245,158,11,0.18)",
  border: "1px solid rgba(251,191,36,0.4)",
  color: "#fde68a",
  fontSize: 14,
  lineHeight: 1.5,
};
