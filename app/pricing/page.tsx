"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAuthSession } from "../hooks/useAuthSession";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { DASHBOARD_PATH, LOGIN_PATH } from "../lib/authRoutes";
import { PAID_PLANS, PLAN_DEFINITIONS, type SubscriptionPlan } from "../lib/subscriptionPlans";

const MOBILE_MAX = 1024;

/** Pricing-page display only (ECPay AI credits checkout not yet available). */
const PRICING_AI_CREDIT_PACKS = [
  { id: "credits_100", nameZh: "100次 AI點數", priceZh: "NT$99" },
  { id: "credits_500", nameZh: "500次 AI點數", priceZh: "NT$399" },
  { id: "credits_1000", nameZh: "1000次 AI點數", priceZh: "NT$699" },
] as const;

/** Pricing-page feature bullets only (display; catalog limits unchanged). */
const PRICING_PLAN_FEATURES: Record<SubscriptionPlan, string[]> = {
  trial: [
    "30 次 AI 分析",
    "客戶對話分析",
    "AI 客戶摘要",
    "CRM 客戶管理",
    "基本追蹤功能",
  ],
  starter: [
    "每月 300 次 AI 分析",
    "客戶對話分析",
    "AI 客戶摘要",
    "AI 跟進建議",
    "CRM 客戶管理",
    "客戶資料儲存",
  ],
  professional: [
    "每月 2000 次 AI 分析",
    "客戶對話分析",
    "AI 客戶摘要",
    "AI 跟進建議",
    "CRM 客戶管理",
    "客戶資料儲存",
    "更多分析額度",
  ],
  enterprise: [
    "客製化功能開發",
    "客製化分析流程",
    "客製化 AI 工作流程",
    "客製化報表需求",
    "系統整合需求",
    "專屬技術支援",
    "依企業需求提供客製化功能與系統整合服務",
  ],
};

const pageFont =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export default function PricingPage() {
  const router = useRouter();
  const { session } = useAuthSession();
  const viewportWidth = useViewportWidth();
  const isMobile = viewportWidth === null || viewportWidth < MOBILE_MAX;
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const startCheckout = useCallback(
    async (params: { plan: SubscriptionPlan }) => {
      if (!session) {
        router.push(`${LOGIN_PATH}?next=/pricing`);
        return;
      }

      setBusy(params.plan);
      setNotice(null);
      try {
        const body = {
          plan: params.plan,
          payment_method: "credit_recurring",
        };
        const res = await fetch("/api/ecpay/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          redirectUrl?: string | null;
          message?: string;
          error?: string;
        };
        if (data.ok && data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
        setNotice(data.error ?? data.message ?? "無法建立結帳連結，請稍後再試");
      } catch {
        setNotice("無法連線至帳單服務");
      } finally {
        setBusy(null);
      }
    },
    [router, session],
  );

  const plans: SubscriptionPlan[] = ["trial", ...PAID_PLANS];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(90deg,#06192f,#003c42)",
        padding: isMobile ? "20px 16px 40px" : "32px 24px 56px",
        color: "white",
        fontFamily: pageFont,
        boxSizing: "border-box",
      }}
    >
      <header
        style={{
          maxWidth: 1100,
          margin: "0 auto 32px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ margin: "12px 0 8px", fontSize: isMobile ? 32 : 44, fontWeight: 800 }}>
            方案與定價
          </h1>
          <p style={{ margin: 0, opacity: 0.85, fontSize: isMobile ? 15 : 18, lineHeight: 1.55 }}>
            從免費體驗開始，依需求升級個人、專業或企業方案
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href={session ? DASHBOARD_PATH : "/"}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.12)",
              color: "white",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            返回首頁
          </Link>
        </div>
      </header>

      {notice ? (
        <p
          style={{
            maxWidth: 1100,
            margin: "0 auto 24px",
            padding: "14px 18px",
            borderRadius: 14,
            background: "rgba(129,140,248,0.2)",
            border: "1px solid rgba(129,140,248,0.45)",
            fontSize: 15,
            lineHeight: 1.5,
          }}
        >
          {notice}
        </p>
      ) : null}

      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
          gap: isMobile ? 16 : 22,
        }}
      >
        {plans.map((planId) => {
          const plan = PLAN_DEFINITIONS[planId];
          const isTrial = planId === "trial";
          const isEnterprise = planId === "enterprise";
          const isHighlight = plan.highlight === true;

          return (
            <article
              key={planId}
              style={{
                background: isHighlight ? "#243b5c" : "#20334d",
                borderRadius: 20,
                padding: isMobile ? 22 : 26,
                border: isHighlight
                  ? "1px solid rgba(129,140,248,0.55)"
                  : "1px solid rgba(255,255,255,0.08)",
                boxShadow: isHighlight ? "0 16px 40px rgba(0,0,0,0.28)" : undefined,
                display: "flex",
                flexDirection: "column",
                minHeight: isMobile ? undefined : 420,
              }}
            >
              {isHighlight ? (
                <span
                  style={{
                    alignSelf: "flex-start",
                    fontSize: 12,
                    fontWeight: 800,
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: "linear-gradient(135deg,#818cf8,#c084fc)",
                    color: "#0f172a",
                    marginBottom: 12,
                  }}
                >
                  推薦
                </span>
              ) : null}
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{plan.nameZh}</h2>
              <p style={{ margin: "10px 0 0", fontSize: 28, fontWeight: 800 }}>
                {plan.priceZh}
                {plan.periodZh ? (
                  <span style={{ fontSize: 14, fontWeight: 500, opacity: 0.75 }}>
                    {" "}
                    / {plan.periodZh}
                  </span>
                ) : null}
              </p>
              <ul
                style={{
                  margin: "20px 0 0",
                  paddingLeft: 18,
                  flex: 1,
                  fontSize: 14,
                  lineHeight: 1.65,
                  opacity: 0.92,
                }}
              >
                {PRICING_PLAN_FEATURES[planId].map((f) => (
                  <li key={f} style={{ marginBottom: 8 }}>
                    {f}
                  </li>
                ))}
              </ul>
              {isTrial ? (
                <Link
                  href={session ? DASHBOARD_PATH : LOGIN_PATH}
                  style={{
                    marginTop: 20,
                    display: "block",
                    textAlign: "center",
                    padding: "12px 16px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.12)",
                    color: "white",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  {plan.ctaZh}
                </Link>
              ) : isEnterprise ? (
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      "https://line.me/R/ti/p/@460jxzer",
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  style={{
                    marginTop: 20,
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.2)",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 15,
                    background: "rgba(255,255,255,0.1)",
                    color: "white",
                  }}
                >
                  {plan.ctaZh}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy === planId}
                  onClick={() => void startCheckout({ plan: planId })}
                  style={{
                    marginTop: 20,
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "none",
                    cursor: busy === planId ? "wait" : "pointer",
                    fontWeight: 700,
                    fontSize: 15,
                    background: "linear-gradient(135deg,#818cf8,#c084fc)",
                    color: "#0f172a",
                  }}
                >
                  {busy === planId ? "處理中…" : plan.ctaZh}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <section
        style={{
          maxWidth: 1100,
          margin: "40px auto 0",
          background: "#20334d",
          borderRadius: 20,
          padding: isMobile ? 22 : 28,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>加購 AI 點數</h2>
        <p style={{ margin: "0 0 20px", opacity: 0.85, fontSize: 15, lineHeight: 1.55 }}>
          本月額度用完時，可另行購買 AI 點數
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: 16,
          }}
        >
          {PRICING_AI_CREDIT_PACKS.map((pack) => (
            <div
              key={pack.id}
              style={{
                padding: 18,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.15)",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{pack.nameZh}</div>
                <div style={{ marginTop: 6, opacity: 0.85 }}>{pack.priceZh}</div>
              </div>
              <button
                type="button"
                disabled
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(129,140,248,0.5)",
                  background: "transparent",
                  color: "white",
                  fontWeight: 600,
                  cursor: "not-allowed",
                  opacity: 0.75,
                }}
              >
                即將推出
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
