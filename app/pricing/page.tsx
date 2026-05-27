"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAuthSession } from "../hooks/useAuthSession";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { DASHBOARD_PATH, LOGIN_PATH } from "../lib/authRoutes";
import {
  AI_CREDIT_PACKS,
  PAID_PLANS,
  PLAN_DEFINITIONS,
  type SubscriptionPlan,
} from "../lib/subscriptionPlans";

const MOBILE_MAX = 1024;

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
    async (params: { intent: "subscription" | "ai_credits"; plan?: SubscriptionPlan; creditPackId?: string }) => {
      if (!session) {
        router.push(`${LOGIN_PATH}?next=/pricing`);
        return;
      }

      const key = params.creditPackId ?? params.plan ?? "checkout";
      setBusy(key);
      setNotice(null);
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            intent: params.intent,
            plan: params.plan,
            credit_pack_id: params.creditPackId,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          checkoutUrl?: string;
          message?: string;
          error?: string;
        };
        if (data.ok && data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
        setNotice(data.error ?? data.message ?? "無法建立結帳連結，請稍後再試");
      } catch {
        setNotice("無法建立結帳預覽，請稍後再試");
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
          <Link href="/" style={{ color: "#94a3b8", textDecoration: "none", fontSize: 14 }}>
            ← LINE Work AI
          </Link>
          <h1 style={{ margin: "12px 0 8px", fontSize: isMobile ? 32 : 44, fontWeight: 800 }}>
            方案與定價
          </h1>
          <p style={{ margin: 0, opacity: 0.85, fontSize: isMobile ? 15 : 18, lineHeight: 1.55 }}>
            從免費體驗開始，依需求升級個人、專業或企業方案
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {session ? (
            <Link
              href={DASHBOARD_PATH}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.12)",
                color: "white",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              前往儀表板
            </Link>
          ) : (
            <Link
              href={LOGIN_PATH}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                background: "linear-gradient(135deg,#818cf8,#c084fc)",
                color: "#0f172a",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              登入開始試用
            </Link>
          )}
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
                {plan.features.map((f) => (
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
                  {session ? "前往儀表板" : plan.ctaZh}
                </Link>
              ) : isEnterprise ? (
                <button
                  type="button"
                  onClick={() =>
                    setNotice("請聯絡我們，由專人為您報價並開通企業方案。")
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
                  onClick={() =>
                    void startCheckout({ intent: "subscription", plan: planId })
                  }
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
          本月額度用完時，可另行購買 AI 點數（Stripe 上線後啟用）
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: 16,
          }}
        >
          {AI_CREDIT_PACKS.map((pack) => (
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
                disabled={busy === pack.id}
                onClick={() =>
                  void startCheckout({ intent: "ai_credits", creditPackId: pack.id })
                }
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(129,140,248,0.5)",
                  background: "transparent",
                  color: "white",
                  fontWeight: 600,
                  cursor: busy === pack.id ? "wait" : "pointer",
                }}
              >
                {busy === pack.id ? "處理中…" : "購買 AI 點數"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
