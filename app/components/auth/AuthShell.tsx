"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { authCopy } from "../../lib/authI18n";
import {
  authCardStyle,
  authLinkStyle,
  authMutedStyle,
  authPageStyle,
} from "../../lib/authStyles";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main style={authPageStyle}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <p
          style={{
            margin: "0 0 20px",
            textAlign: "center",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#86efac",
          }}
        >
          {authCopy.brand}
        </p>
        <div style={authCardStyle}>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "#f8fafc",
            }}
          >
            {title}
          </h1>
          <p style={{ ...authMutedStyle, margin: "10px 0 24px" }}>{subtitle}</p>
          {children}
          {footer ? <div style={{ marginTop: 20 }}>{footer}</div> : null}
        </div>
        <p style={{ ...authMutedStyle, textAlign: "center", marginTop: 20 }}>
          <Link href="/" style={authLinkStyle}>
            {authCopy.backHome}
          </Link>
        </p>
      </div>
    </main>
  );
}

export function AuthDivider() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "20px 0",
        color: "#64748b",
        fontSize: 13,
      }}
    >
      <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
      <span>{authCopy.orDivider}</span>
      <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
    </div>
  );
}
