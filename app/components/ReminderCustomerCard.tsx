"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import {
  getCustomerUrgencyVisual,
  urgencyLabel,
  type ReminderCustomerRow,
} from "../lib/calendarReminders";
import { formatFollowUpDateDisplay } from "../lib/followUpReminders";
import { translateDisplayValue } from "../lib/uiI18n";

export type ReminderCustomerCardLabels = {
  followUpDate: string;
  nextStep: string;
  followUpMsg: string;
  estimatedAmount: string;
  dealRate: string;
  viewCustomer: string;
  lineOaSend: string;
  lineOaHint?: string;
  markCompleted?: string;
  unnamed: string;
};

export type ReminderCustomerCardProps = {
  customer: ReminderCustomerRow;
  lang: AppLang;
  labels: ReminderCustomerCardLabels;
  isMobile?: boolean;
  showMarkComplete?: boolean;
  onMarkComplete?: (id: string | number) => void;
  markBusy?: boolean;
};

export function ReminderCustomerCard({
  customer,
  lang,
  labels,
  isMobile = false,
  showMarkComplete = false,
  onMarkComplete,
  markBusy = false,
}: ReminderCustomerCardProps) {
  const visual = getCustomerUrgencyVisual(customer);
  const display = (v?: string | null) => translateDisplayValue(v, lang);
  const ymd = customer.follow_up_date;
  const pad = isMobile ? 18 : 22;
  const fontBase = isMobile ? 16 : 15;

  const card: CSSProperties = {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    borderRadius: 16,
    padding: pad,
    border: `1px solid ${visual.border}`,
    background: visual.bg,
    boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
    overflow: "hidden",
  };

  const row: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
    fontSize: fontBase,
    lineHeight: 1.55,
    marginBottom: 8,
  };

  const labelStyle: CSSProperties = { opacity: 0.72, fontWeight: 600 };
  const valueStyle: CSSProperties = { fontWeight: 600, textAlign: "right", flex: "1 1 140px", wordBreak: "break-word" };

  return (
    <article style={card}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <Link
          href={`/customers/${customer.id}`}
          style={{
            fontSize: isMobile ? 20 : 22,
            fontWeight: 800,
            color: "#f8fafc",
            textDecoration: "none",
            wordBreak: "break-word",
          }}
        >
          {customer.customer_name?.trim() || labels.unnamed}
        </Link>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            padding: "6px 12px",
            borderRadius: 999,
            background: visual.badgeBg,
            color: visual.badgeColor,
            border: `1px solid ${visual.border}`,
          }}
        >
          {urgencyLabel(visual, lang)}
        </span>
      </div>

      {customer.company_name?.trim() ? (
        <p style={{ margin: "0 0 12px", fontSize: fontBase, color: "#94a3b8" }}>{customer.company_name}</p>
      ) : null}

      <div style={row}>
        <span style={labelStyle}>{labels.followUpDate}</span>
        <span style={valueStyle}>{ymd ? formatFollowUpDateDisplay(ymd, lang) : "—"}</span>
      </div>
      <div style={row}>
        <span style={labelStyle}>{labels.nextStep}</span>
        <span style={valueStyle}>{display(customer.next_step) || "—"}</span>
      </div>
      <div style={row}>
        <span style={labelStyle}>{labels.followUpMsg}</span>
        <span style={valueStyle}>{display(customer.follow_up) || "—"}</span>
      </div>
      <div style={row}>
        <span style={labelStyle}>{labels.estimatedAmount}</span>
        <span style={valueStyle}>{display(customer.estimated_amount) || "—"}</span>
      </div>
      <div style={{ ...row, marginBottom: 16 }}>
        <span style={labelStyle}>{labels.dealRate}</span>
        <span style={valueStyle}>{display(customer.success_rate) || "—"}</span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <Link
          href={`/customers/${customer.id}`}
          style={{
            flex: isMobile ? "1 1 auto" : "1 1 140px",
            padding: isMobile ? "16px 18px" : "12px 16px",
            borderRadius: 12,
            border: "none",
            background: "#22c55e",
            color: "#fff",
            fontWeight: 700,
            fontSize: isMobile ? 17 : 15,
            textAlign: "center",
            textDecoration: "none",
            minHeight: isMobile ? 48 : undefined,
            boxSizing: "border-box",
          }}
        >
          {labels.viewCustomer}
        </Link>

        <button
          type="button"
          disabled
          title={labels.lineOaHint}
          style={{
            flex: isMobile ? "1 1 auto" : "1 1 200px",
            padding: isMobile ? "16px 18px" : "12px 16px",
            borderRadius: 12,
            border: "1px dashed rgba(6,199,85,0.45)",
            background: "rgba(6,199,85,0.08)",
            color: "#86efac",
            fontWeight: 600,
            fontSize: isMobile ? 15 : 14,
            cursor: "not-allowed",
            opacity: 0.85,
            minHeight: isMobile ? 48 : undefined,
          }}
        >
          {labels.lineOaSend}
        </button>

        {showMarkComplete && labels.markCompleted && onMarkComplete ? (
          <button
            type="button"
            disabled={markBusy}
            onClick={() => onMarkComplete(customer.id)}
            style={{
              flex: isMobile ? "1 1 auto" : "1 1 120px",
              padding: isMobile ? "16px 18px" : "12px 16px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.08)",
              color: "#e2e8f0",
              fontWeight: 700,
              fontSize: isMobile ? 16 : 14,
              cursor: markBusy ? "wait" : "pointer",
              minHeight: isMobile ? 48 : undefined,
            }}
          >
            {labels.markCompleted}
          </button>
        ) : null}
      </div>
    </article>
  );
}
