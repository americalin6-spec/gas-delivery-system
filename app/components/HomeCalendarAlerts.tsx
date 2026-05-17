"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import {
  filterCalendarCustomers,
  getCustomerUrgencyVisual,
  buildNotificationItems,
  urgencyLabel,
  type ReminderCustomerRow,
} from "../lib/calendarReminders";
import { notificationBucketTitle } from "../lib/calendarI18n";
import { homePageCopy } from "../lib/uiI18n";
import { formatFollowUpDateDisplay } from "../lib/followUpReminders";

const PREVIEW_LIMIT = 4;

export function HomeCalendarSection({
  customers,
  lang,
  isMobile,
  block,
}: {
  customers: ReminderCustomerRow[];
  lang: AppLang;
  isMobile: boolean;
  block?: CSSProperties;
}) {
  const ui = homePageCopy(lang);
  const preview = filterCalendarCustomers(customers).slice(0, PREVIEW_LIMIT);

  return (
    <section
      style={{
        ...(block ?? {}),
        background: "#132846",
        borderRadius: 16,
        padding: isMobile ? 18 : 22,
        overflow: "hidden",
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 22, fontWeight: 800 }}>{ui.calendarTitle}</h2>
        <Link
          href="/calendar"
          style={{
            padding: isMobile ? "12px 16px" : "10px 14px",
            borderRadius: 10,
            background: "#22c55e",
            color: "#fff",
            fontWeight: 700,
            fontSize: isMobile ? 15 : 14,
            textDecoration: "none",
          }}
        >
          {ui.viewCalendar}
        </Link>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.55, color: "#94a3b8" }}>{ui.calendarLead}</p>

      {preview.length === 0 ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 15 }}>{ui.calendarEmpty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {preview.map((c) => {
            const visual = getCustomerUrgencyVisual(c);
            return (
              <Link
                key={String(c.id)}
                href={`/customers/${c.id}`}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "#f8fafc",
                  padding: isMobile ? 14 : 16,
                  borderRadius: 12,
                  border: `1px solid ${visual.border}`,
                  background: visual.bg,
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: isMobile ? 17 : 16 }}>
                    {c.customer_name?.trim() || ui.unnamed}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "4px 9px",
                      borderRadius: 999,
                      background: visual.badgeBg,
                      color: visual.badgeColor,
                    }}
                  >
                    {urgencyLabel(visual, lang)}
                  </span>
                </div>
                <span style={{ fontSize: 14, color: "#cbd5e1" }}>
                  {c.follow_up_date ? formatFollowUpDateDisplay(c.follow_up_date, lang) : "—"}
                  {c.company_name?.trim() ? ` · ${c.company_name}` : ""}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function HomeAlertsSection({
  rows,
  lang,
  isMobile,
  block,
}: {
  rows: ReminderCustomerRow[];
  lang: AppLang;
  isMobile: boolean;
  block?: CSSProperties;
}) {
  const ui = homePageCopy(lang);
  const items = buildNotificationItems(rows).slice(0, PREVIEW_LIMIT);

  return (
    <section
      style={{
        ...(block ?? {}),
        background: "#132846",
        borderRadius: 16,
        padding: isMobile ? 18 : 22,
        overflow: "hidden",
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 22, fontWeight: 800 }}>{ui.homeAlertsTitle}</h2>
        <Link
          href="/alerts"
          style={{
            padding: isMobile ? "12px 16px" : "10px 14px",
            borderRadius: 10,
            border: "1px solid #1e3a5f",
            background: "#1a3557",
            color: "#e2e8f0",
            fontWeight: 700,
            fontSize: isMobile ? 15 : 14,
            textDecoration: "none",
          }}
        >
          {ui.viewAlerts}
        </Link>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.55, color: "#94a3b8" }}>{ui.homeAlertsLead}</p>

      {items.length === 0 ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 15 }}>{ui.calendarEmpty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map(({ bucket, customer, urgency }) => (
            <Link
              key={`${bucket}-${customer.id}`}
              href={`/customers/${customer.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                color: "#f8fafc",
                padding: isMobile ? 14 : 14,
                borderRadius: 12,
                border: `1px solid ${urgency.border}`,
                background: urgency.bg,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "#86efac" }}>
                {notificationBucketTitle(bucket, lang)}
              </span>
              <div style={{ fontWeight: 700, fontSize: isMobile ? 17 : 16, marginTop: 4 }}>
                {customer.customer_name?.trim() || ui.unnamed}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
