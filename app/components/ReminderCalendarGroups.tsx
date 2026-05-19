"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  diffDaysFromToday,
  getCustomerUrgencyVisual,
  groupCalendarRemindersByUrgency,
  type ReminderCustomerRow,
} from "../lib/calendarReminders";
import { calendarPageCopy } from "../lib/calendarI18n";
import { formatFollowUpDateDisplay, normalizeFollowUpDateValue } from "../lib/followUpReminders";
import type { AppLang } from "../lib/appLang";

type GroupConfig = {
  key: "overdue" | "today" | "next7";
  title: string;
  empty: string;
  customers: ReminderCustomerRow[];
};

export function ReminderCalendarGroups({
  customers,
  lang,
  isMobile,
}: {
  customers: ReminderCustomerRow[];
  lang: AppLang;
  isMobile: boolean;
}) {
  const t = calendarPageCopy(lang);

  const groups = useMemo<GroupConfig[]>(() => {
    const grouped = groupCalendarRemindersByUrgency(customers);
    return [
      { key: "overdue", title: t.groupOverdue, empty: t.groupEmptyOverdue, customers: grouped.overdue },
      { key: "today", title: t.groupToday, empty: t.groupEmptyToday, customers: grouped.today },
      { key: "next7", title: t.groupNext7, empty: t.groupEmptyNext7, customers: grouped.next7 },
    ];
  }, [customers, t.groupOverdue, t.groupToday, t.groupNext7, t.groupEmptyOverdue, t.groupEmptyToday, t.groupEmptyNext7]);

  return (
    <section
      style={{
        marginBottom: isMobile ? 20 : 28,
        padding: isMobile ? 18 : 24,
        borderRadius: 16,
        background: "rgba(15,23,42,0.55)",
        border: "1px solid #1e3a5f",
      }}
    >
      <div style={{ marginBottom: isMobile ? 14 : 18 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 22, fontWeight: 800, color: "#f8fafc" }}>
          {t.groupsTitle}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#8ea4c7" }}>{t.groupsLead}</p>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
          gap: isMobile ? 14 : 16,
        }}
      >
        {groups.map((group) => (
          <GroupColumn
            key={group.key}
            group={group}
            lang={lang}
            isMobile={isMobile}
            unnamed={t.unnamed}
            daysOverdue={t.daysOverdue}
            daysUntil={t.daysUntil}
          />
        ))}
      </div>
    </section>
  );
}

function GroupColumn({
  group,
  lang,
  isMobile,
  unnamed,
  daysOverdue,
  daysUntil,
}: {
  group: GroupConfig;
  lang: AppLang;
  isMobile: boolean;
  unnamed: string;
  daysOverdue: (n: number) => string;
  daysUntil: (n: number) => string;
}) {
  const empty = group.customers.length === 0;

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(148,163,184,0.18)",
        background: "rgba(15,23,42,0.4)",
        padding: isMobile ? 14 : 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxHeight: isMobile ? 320 : 380,
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f8fafc" }}>{group.title}</h3>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            background: "rgba(99,102,241,0.18)",
            color: "#c7d2fe",
          }}
        >
          {group.customers.length}
        </span>
      </div>

      {empty ? (
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.55 }}>{group.empty}</p>
      ) : (
        group.customers.map((customer) => {
          const urgency = getCustomerUrgencyVisual(customer);
          const ymd = normalizeFollowUpDateValue(customer.follow_up_date);
          const diff = ymd ? diffDaysFromToday(ymd) : null;
          const relative =
            diff === null || diff === 0
              ? ""
              : diff < 0
                ? daysOverdue(-diff)
                : daysUntil(diff);

          return (
            <Link
              key={`${group.key}-${customer.id}`}
              href={`/customers/${customer.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                borderRadius: 10,
                padding: "10px 12px",
                border: `1px solid ${urgency.border}`,
                background: urgency.bg,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14, color: "#f8fafc" }}>
                  {customer.customer_name?.trim() || unnamed}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: urgency.badgeBg,
                    color: urgency.badgeColor,
                    whiteSpace: "nowrap",
                  }}
                >
                  {lang === "zh" ? urgency.labelZh : urgency.labelEn}
                </span>
              </div>
              {customer.follow_up_date ? (
                <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                  {formatFollowUpDateDisplay(customer.follow_up_date, lang)}
                  {relative ? ` · ${relative}` : ""}
                </div>
              ) : null}
            </Link>
          );
        })
      )}
    </div>
  );
}
