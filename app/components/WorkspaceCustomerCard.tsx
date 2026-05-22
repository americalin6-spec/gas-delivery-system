"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import { followUpWorkspaceCopy } from "../lib/followUpWorkspaceI18n";
import { formatCustomerCreatedAtDisplay } from "../lib/customerSoftDelete";
import {
  formatWorkspaceDateTime,
  getLastContactAt,
  getWorkspaceCustomerStatus,
  type WorkspaceCustomerRow,
} from "../lib/followUpWorkspace";
import { customerStatusLabel, customerStatusVisual } from "../lib/customerStatus";
import { translateDisplayValue } from "../lib/uiI18n";
import type { CopyWithFallbackOptions } from "../hooks/useCopyWithFallback";

export function WorkspaceCustomerCard({
  row,
  lang,
  isMobile,
  onComplete,
  onPostpone,
  copyWithFallback,
}: {
  row: WorkspaceCustomerRow;
  lang: AppLang;
  isMobile: boolean;
  onComplete: (row: WorkspaceCustomerRow) => void;
  onPostpone: (row: WorkspaceCustomerRow) => void;
  copyWithFallback: (text: string, options?: CopyWithFallbackOptions) => Promise<boolean>;
}) {
  const labels = followUpWorkspaceCopy(lang);
  const name = row.customer_name?.trim() || labels.unnamed;
  const deal = row.success_rate ?? row.deal_probability;
  const salesStatus = getWorkspaceCustomerStatus(row);
  const lastAt = getLastContactAt(row);
  const createdLabel = formatCustomerCreatedAtDisplay(row.created_at, lang);

  const fields: { label: string; value: string }[] = [
    { label: labels.customerName, value: name },
    { label: labels.phone, value: row.phone?.trim() || "—" },
    { label: labels.lineId, value: row.line_id?.trim() || "—" },
    { label: labels.customerNeed, value: row.customer_need?.trim() || "—" },
    {
      label: labels.dealProbability,
      value: deal?.trim() ? translateDisplayValue(deal, lang) : "—",
    },
    {
      label: labels.customerStatus,
      value: customerStatusLabel(salesStatus, lang),
    },
    { label: labels.createdAt, value: createdLabel ?? "—" },
    { label: labels.lastContact, value: lastAt ? formatWorkspaceDateTime(lastAt, lang) : "—" },
    { label: labels.remark, value: row.follow_up_note?.trim() || row.note?.trim() || "—" },
  ];

  const btn: CSSProperties = {
    padding: isMobile ? "10px 12px" : "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.1)",
    color: "#f8fafc",
    fontSize: isMobile ? 14 : 13,
    fontWeight: 600,
    cursor: "pointer",
    flex: isMobile ? "1 1 calc(50% - 6px)" : "0 1 auto",
    minWidth: 0,
    textAlign: "center",
    textDecoration: "none",
    boxSizing: "border-box",
  };

  return (
    <article
      style={{
        borderRadius: 16,
        border: "1px solid #1e3a5f",
        background: "rgba(16,39,66,0.85)",
        padding: isMobile ? 16 : 18,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <h3 style={{ margin: "0 0 12px", fontSize: isMobile ? 18 : 17, fontWeight: 800, wordBreak: "break-word" }}>
        {name}
      </h3>
      <dl style={{ margin: 0, display: "grid", gap: 8 }}>
        {fields.map((f) => (
          <div key={f.label} style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", fontSize: 14 }}>
            <dt style={{ margin: 0, opacity: 0.72, fontWeight: 600, flex: "0 0 auto" }}>{f.label}</dt>
            <dd style={{ margin: 0, flex: "1 1 120px", wordBreak: "break-word" }}>{f.value}</dd>
          </div>
        ))}
      </dl>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 14,
          maxWidth: "100%",
        }}
      >
        <Link href={`/customers/${row.id}`} style={btn}>
          {labels.view}
        </Link>
        <Link href={`/customers/${row.id}`} style={btn}>
          {labels.edit}
        </Link>
        <button type="button" style={btn} onClick={() => onComplete(row)}>
          {labels.complete}
        </button>
        <button type="button" style={btn} onClick={() => onPostpone(row)}>
          {labels.postpone}
        </button>
        <button
          type="button"
          style={btn}
          onClick={() => void copyWithFallback(row.line_id?.trim() || "", { title: labels.lineId })}
          disabled={!row.line_id?.trim()}
        >
          {labels.copyLine}
        </button>
        <button
          type="button"
          style={btn}
          onClick={() => void copyWithFallback(row.phone?.trim() || "", { title: labels.phone })}
          disabled={!row.phone?.trim()}
        >
          {labels.copyPhone}
        </button>
      </div>
    </article>
  );
}
