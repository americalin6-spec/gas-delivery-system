"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  buildNotificationItems,
  NOTIFICATION_BUCKET_ORDER,
  sortNotificationsByUrgency,
  type NotificationBucket,
  type NotificationItem,
  type ReminderCustomerRow,
} from "../lib/calendarReminders";
import { alertsPageCopy, notificationBucketTitle } from "../lib/calendarI18n";
import { formatFollowUpDateDisplay } from "../lib/followUpReminders";
import { translateDisplayValue } from "../lib/uiI18n";
import type { AppLang } from "../lib/appLang";

export function NotificationCenter({
  rows,
  lang,
  isMobile,
  limit,
}: {
  rows: ReminderCustomerRow[];
  lang: AppLang;
  isMobile: boolean;
  /** Cap the number of items shown across all buckets. Omit for full list. */
  limit?: number;
}) {
  const t = alertsPageCopy(lang);

  const { shown, totalCount, shownCount } = useMemo(() => {
    const all = sortNotificationsByUrgency(buildNotificationItems(rows));
    const cap = typeof limit === "number" && limit > 0 ? limit : all.length;
    const capped = all.slice(0, cap);

    const grouped = new Map<NotificationBucket, NotificationItem[]>();
    for (const b of NOTIFICATION_BUCKET_ORDER) grouped.set(b, []);
    for (const item of capped) {
      const list = grouped.get(item.bucket) ?? [];
      list.push(item);
      grouped.set(item.bucket, list);
    }
    return { shown: grouped, totalCount: all.length, shownCount: capped.length };
  }, [rows, limit]);

  if (totalCount === 0) {
    return <p style={{ color: "#94a3b8", fontSize: 17 }}>{t.empty}</p>;
  }

  const remaining = totalCount - shownCount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {NOTIFICATION_BUCKET_ORDER.map((bucket) => {
        const list = shown.get(bucket) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={bucket}>
            <h2 style={{ margin: "0 0 14px", fontSize: isMobile ? 20 : 22, fontWeight: 800 }}>
              {notificationBucketTitle(bucket, lang)}
              <span style={{ marginLeft: 10, fontSize: 15, fontWeight: 600, color: "#94a3b8" }}>
                ({list.length})
              </span>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {list.map(({ customer, urgency }) => (
                <Link
                  key={`${bucket}-${customer.id}`}
                  href={`/customers/${customer.id}`}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: "inherit",
                    borderRadius: 14,
                    padding: isMobile ? 16 : 18,
                    border: `1px solid ${urgency.border}`,
                    background: urgency.bg,
                    boxSizing: "border-box",
                    width: "100%",
                    maxWidth: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: isMobile ? 18 : 17, color: "#f8fafc" }}>
                      {customer.customer_name?.trim() || t.unnamed}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: urgency.badgeBg,
                        color: urgency.badgeColor,
                      }}
                    >
                      {lang === "zh" ? urgency.labelZh : urgency.labelEn}
                    </span>
                  </div>
                  {customer.company_name?.trim() ? (
                    <p style={{ margin: "0 0 6px", fontSize: 15, color: "#94a3b8" }}>
                      {customer.company_name}
                    </p>
                  ) : null}
                  {customer.follow_up_date ? (
                    <p style={{ margin: 0, fontSize: 14, color: "#cbd5e1" }}>
                      {formatFollowUpDateDisplay(customer.follow_up_date, lang)}
                      {customer.success_rate
                        ? ` · ${translateDisplayValue(customer.success_rate, lang)}`
                        : ""}
                    </p>
                  ) : null}
                  <p style={{ margin: "10px 0 0", fontSize: 14, fontWeight: 600, color: "#86efac" }}>
                    {t.viewCustomer} →
                  </p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {remaining > 0 ? (
        <Link
          href="/alerts/all"
          style={{
            alignSelf: "flex-start",
            padding: isMobile ? "12px 16px" : "10px 16px",
            borderRadius: 12,
            border: "1px solid rgba(99,102,241,0.45)",
            background: "rgba(99,102,241,0.18)",
            color: "#c7d2fe",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {t.viewAllNotifications} · {t.moreCount(remaining)}
        </Link>
      ) : null}
    </div>
  );
}
