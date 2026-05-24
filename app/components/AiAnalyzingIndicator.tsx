"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";

const KEYFRAMES = `
@keyframes aiRobotBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes aiPopupPulse {
  0%, 100% { transform: scale(1); box-shadow: 0 12px 40px rgba(15, 23, 42, 0.28), 0 0 0 0 rgba(129, 140, 248, 0.2); }
  50% { transform: scale(1.02); box-shadow: 0 14px 44px rgba(15, 23, 42, 0.32), 0 0 0 8px rgba(129, 140, 248, 0); }
}
@keyframes aiDotBlink {
  0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
}
`;

function LoadingDots() {
  const dotStyle = (delay: string): CSSProperties => ({
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "#818cf8",
    animation: `aiDotBlink 1.1s ease-in-out ${delay} infinite`,
  });

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4 }}>
      <span style={dotStyle("0s")} />
      <span style={dotStyle("0.15s")} />
      <span style={dotStyle("0.3s")} />
    </span>
  );
}

/** Small centered floating popup while AI analysis runs. */
export function AiAnalyzingIndicator({ lang }: { lang: AppLang }) {
  void lang;
  const label = "客戶分析中…";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <>
      <style>{KEYFRAMES}</style>
      <div
        role="status"
        aria-live="polite"
        aria-label={label}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            padding: "18px 22px",
            borderRadius: 16,
            background: "rgba(15, 23, 42, 0.92)",
            border: "1px solid rgba(129, 140, 248, 0.45)",
            color: "#e0e7ff",
            minWidth: 148,
            maxWidth: "min(90vw, 220px)",
            animation: "aiPopupPulse 1.8s ease-in-out infinite",
          }}
        >
          <span
            aria-hidden
            style={{
              fontSize: 32,
              lineHeight: 1,
              animation: "aiRobotBounce 1.2s ease-in-out infinite",
            }}
          >
            🤖
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.02,
              textAlign: "center",
            }}
          >
            {label}
          </span>
          <LoadingDots />
        </div>
      </div>
    </>,
    document.body,
  );
}
