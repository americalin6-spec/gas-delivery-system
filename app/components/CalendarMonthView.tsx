"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { AppLang } from "../lib/appLang";
import {
  buildMonthGrid,
  datedReminderDaysInMonth,
  groupCustomersByFollowUpDate,
  monthTitle,
  weekdayLabels,
} from "../lib/calendarMonth";
import { getCustomerUrgencyVisual, type ReminderCustomerRow } from "../lib/calendarReminders";
import { formatFollowUpDateDisplay } from "../lib/followUpReminders";

function ReminderChip({
  customer,
  lang,
  compact,
}: {
  customer: ReminderCustomerRow;
  lang: AppLang;
  compact?: boolean;
}) {
  const visual = getCustomerUrgencyVisual(customer);
  const name = customer.customer_name?.trim() || (lang === "zh" ? "未命名" : "Unnamed");
  const step = customer.next_step?.trim() || (lang === "zh" ? "—" : "—");

  return (
    <Link
      href={`/customers/${customer.id}`}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "block",
        textDecoration: "none",
        color: "#f8fafc",
        fontSize: compact ? 11 : 12,
        lineHeight: 1.35,
        padding: compact ? "4px 6px" : "6px 8px",
        borderRadius: 6,
        border: `1px solid ${visual.border}`,
        background: visual.bg,
        marginBottom: 4,
        overflow: "hidden",
        wordBreak: "break-word",
      }}
    >
      <span style={{ fontWeight: 700 }}>{name}</span>
      <span style={{ display: "block", color: "#cbd5e1", fontWeight: 500, marginTop: 2 }}>{step}</span>
    </Link>
  );
}

export function CalendarMonthView({
  customers,
  lang,
  isMobile,
  viewYear,
  viewMonth,
  labels,
}: {
  customers: ReminderCustomerRow[];
  lang: AppLang;
  isMobile: boolean;
  viewYear: number;
  viewMonth: number;
  labels: {
    noRemindersThisMonth: string;
    mobileDateList: string;
    unnamed: string;
  };
}) {
  const byDate = useMemo(() => groupCustomersByFollowUpDate(customers), [customers]);
  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const weekdays = weekdayLabels(lang);
  const monthDays = useMemo(
    () => datedReminderDaysInMonth(byDate, viewYear, viewMonth),
    [byDate, viewYear, viewMonth],
  );

  if (isMobile) {
    if (monthDays.length === 0) {
      return <p style={{ color: "#94a3b8", fontSize: 17, lineHeight: 1.6 }}>{labels.noRemindersThisMonth}</p>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#94a3b8" }}>{labels.mobileDateList}</h2>
        {monthDays.map((ymd) => {
          const list = byDate.get(ymd) ?? [];
          return (
            <section
              key={ymd}
              style={{
                borderRadius: 14,
                border: "1px solid #1e3a5f",
                background: "rgba(15,39,66,0.65)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  background: "rgba(30,58,95,0.55)",
                  borderBottom: "1px solid #1e3a5f",
                  fontWeight: 800,
                  fontSize: 17,
                }}
              >
                {formatFollowUpDateDisplay(ymd, lang)}
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                {list.map((c) => (
                  <ReminderChip key={String(c.id)} customer={c} lang={lang} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 1,
          background: "#1e3a5f",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #1e3a5f",
          minWidth: 720,
        }}
      >
        {weekdays.map((w) => (
          <div
            key={w}
            style={{
              padding: "10px 4px",
              textAlign: "center",
              fontSize: 13,
              fontWeight: 700,
              color: "#94a3b8",
              background: "#0f2742",
            }}
          >
            {w}
          </div>
        ))}

        {grid.map((cell, idx) => {
          const list = cell.ymd ? (byDate.get(cell.ymd) ?? []) : [];
          const muted = !cell.inMonth;
          return (
            <div
              key={`${cell.ymd ?? "pad"}-${idx}`}
              style={{
                minHeight: 118,
                padding: 8,
                background: cell.isToday ? "rgba(30,58,95,0.85)" : muted ? "rgba(8,20,38,0.9)" : "rgba(15,39,66,0.75)",
                borderTop: cell.isToday ? "2px solid #6366f1" : undefined,
                boxSizing: "border-box",
                verticalAlign: "top",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: cell.isToday ? 800 : 600,
                  color: muted ? "#475569" : cell.isToday ? "#a5b4fc" : "#e2e8f0",
                  marginBottom: 6,
                }}
              >
                {cell.day}
              </div>
              <div style={{ maxHeight: 88, overflowY: "auto" }}>
                {list.map((c) => (
                  <ReminderChip key={String(c.id)} customer={c} lang={lang} compact />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { monthTitle };
