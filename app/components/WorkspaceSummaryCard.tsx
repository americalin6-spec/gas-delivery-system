"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import { followUpWorkspaceCopy } from "../lib/followUpWorkspaceI18n";
import type { WorkspaceCustomerRow } from "../lib/followUpWorkspace";

const PREVIEW_COUNT = 2;

function previewLabel(rows: WorkspaceCustomerRow[], lang: AppLang): string | null {
  const labels = followUpWorkspaceCopy(lang);
  if (rows.length === 0) return null;
  const names = rows
    .slice(0, PREVIEW_COUNT)
    .map((r) => r.customer_name?.trim() || labels.unnamed);
  if (rows.length > PREVIEW_COUNT) {
    const rest = rows.length - PREVIEW_COUNT;
    return lang === "zh"
      ? `${names.join("、")} ${labels.previewMore}${rest}${labels.previewOthers}`
      : `${names.join(", ")} ${labels.previewMore} ${rest}${labels.previewOthers}`;
  }
  return names.join(lang === "zh" ? "、" : ", ");
}

export function WorkspaceSummaryCard({
  title,
  href,
  rows,
  lang,
  isMobile,
}: {
  title: string;
  href: string;
  rows: WorkspaceCustomerRow[];
  lang: AppLang;
  isMobile: boolean;
}) {
  const labels = followUpWorkspaceCopy(lang);
  const preview = previewLabel(rows, lang);

  const card: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: isMobile ? 16 : 18,
    borderRadius: 16,
    border: "1px solid #1e3a5f",
    background: "rgba(16,39,66,0.9)",
    color: "#f8fafc",
    textDecoration: "none",
    transition: "border-color 0.15s ease, background 0.15s ease",
  };

  const viewAllBtn: CSSProperties = {
    alignSelf: "flex-start",
    marginTop: 4,
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid rgba(34,197,94,0.45)",
    background: "rgba(34,197,94,0.15)",
    color: "#86efac",
    fontSize: 14,
    fontWeight: 700,
    textDecoration: "none",
    boxSizing: "border-box",
  };

  return (
    <Link href={href} style={card}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: isMobile ? 17 : 18, fontWeight: 800, lineHeight: 1.35, flex: 1, minWidth: 0 }}>
          {title}
        </h3>
        <span
          style={{
            flexShrink: 0,
            fontSize: isMobile ? 28 : 32,
            fontWeight: 800,
            lineHeight: 1,
            color: "#22c55e",
          }}
        >
          {rows.length}
        </span>
      </div>
      {preview ? (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#cbd5e1", wordBreak: "break-word" }}>{preview}</p>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>{labels.empty}</p>
      )}
      <span style={viewAllBtn}>{labels.viewAll}</span>
    </Link>
  );
}
