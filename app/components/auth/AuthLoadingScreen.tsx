"use client";

import { authCopy } from "../../lib/authI18n";
import { authPageStyle } from "../../lib/authStyles";

export function AuthLoadingScreen() {
  return (
    <main
      style={authPageStyle}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        style={{
          textAlign: "center",
          color: "#cbd5e1",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            margin: "0 auto 16px",
            borderRadius: "50%",
            border: "3px solid rgba(129,140,248,0.25)",
            borderTopColor: "#818cf8",
            animation: "authSpin 0.9s linear infinite",
          }}
        />
        <p style={{ margin: 0, fontSize: 16 }}>{authCopy.authChecking}</p>
      </div>
      <style>{`
        @keyframes authSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
