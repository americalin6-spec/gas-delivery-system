"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import { authCopy } from "../lib/authI18n";
import { authLinkStyle } from "../lib/authStyles";
import { homePageCopy } from "../lib/uiI18n";
import { GoogleSignInButton } from "./auth/GoogleSignInButton";

export function HomeLandingHero({
  lang,
  isMobile,
  onStart,
}: {
  lang: AppLang;
  isMobile: boolean;
  onStart: () => void;
}) {
  const t = homePageCopy(lang);

  const box: CSSProperties = {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  };

  const features = [
    { title: t.landingFeature1Title, desc: t.landingFeature1Desc },
    { title: t.landingFeature2Title, desc: t.landingFeature2Desc },
    { title: t.landingFeature3Title, desc: t.landingFeature3Desc },
  ];

  return (
    <section
      style={{
        ...box,
        borderRadius: isMobile ? 20 : 24,
        padding: isMobile ? "28px 20px 32px" : "48px 40px 52px",
        background:
          "linear-gradient(145deg, rgba(30,58,95,0.95) 0%, rgba(6,25,47,0.98) 45%, rgba(0,60,66,0.92) 100%)",
        border: "1px solid rgba(129,140,248,0.25)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -40,
          right: -20,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "rgba(34,197,94,0.12)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -60,
          left: -30,
          width: 220,
          height: 220,
          borderRadius: "50%",
          background: "rgba(99,102,241,0.1)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1, ...box }}>
        <p
          style={{
            margin: "0 0 12px",
            fontSize: isMobile ? 13 : 14,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#86efac",
          }}
        >
          智能分析與成交管理平台
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: isMobile ? "2rem" : "clamp(2.25rem, 4vw, 3.25rem)",
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.03em",
            wordBreak: "break-word",
          }}
        >
          {t.landingTitle}
        </h1>
        <p
          style={{
            margin: "16px 0 0",
            fontSize: isMobile ? 17 : 20,
            lineHeight: 1.6,
            color: "#cbd5e1",
            maxWidth: 640,
            wordBreak: "break-word",
          }}
        >
          {t.landingSubtitle}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: isMobile ? 12 : 16,
            marginTop: isMobile ? 24 : 32,
            width: "100%",
          }}
        >
          {features.map((f, i) => (
            <div
              key={i}
              style={{
                ...box,
                padding: isMobile ? 16 : 18,
                borderRadius: 14,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "rgba(34,197,94,0.2)",
                  color: "#86efac",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 14,
                  marginBottom: 10,
                }}
              >
                {i + 1}
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: isMobile ? 17 : 18, fontWeight: 700 }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#94a3b8" }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <div
          style={{
            ...box,
            marginTop: isMobile ? 24 : 28,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            maxWidth: isMobile ? "100%" : 320,
          }}
        >
          <GoogleSignInButton />
          <button
            type="button"
            onClick={onStart}
            style={{
              ...box,
              padding: isMobile ? "16px 24px" : "16px 32px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(90deg, #22c55e, #16a34a)",
              color: "#fff",
              fontSize: isMobile ? 18 : 19,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(34,197,94,0.35)",
            }}
          >
            {t.landingCta}
          </button>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "#94a3b8",
              textAlign: "center",
            }}
          >
            <Link href="/login" style={authLinkStyle}>
              {authCopy.emailSignIn}
            </Link>
            <span style={{ margin: "0 10px", opacity: 0.5 }}>·</span>
            <Link href="/signup" style={authLinkStyle}>
              {authCopy.emailSignUp}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
