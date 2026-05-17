"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserNotificationBanner } from "../components/BrowserNotificationBanner";
import { useAppLang } from "../hooks/useAppLang";
import { useIsViewportBelow } from "../hooks/useViewportWidth";
import {
  buildNotificationItems,
  CALENDAR_CUSTOMER_SELECT,
  type NotificationBucket,
  type NotificationItem,
  type ReminderCustomerRow,
} from "../lib/calendarReminders";
import { alertsPageCopy, notificationBucketTitle } from "../lib/calendarI18n";
import { formatFollowUpDateDisplay } from "../lib/followUpReminders";
import { translateDisplayValue } from "../lib/uiI18n";
import { supabase } from "../supabase";

const MOBILE_MAX = 1024;

const BUCKET_ORDER: NotificationBucket[] = ["due_today", "overdue", "high_deal", "no_contact_3d"];

export default function AlertsPage() {
  const { lang } = useAppLang();
  const t = alertsPageCopy(lang);
  const isMobile = useIsViewportBelow(MOBILE_MAX);

  const [rows, setRows] = useState<ReminderCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.from("customers").select(CALENDAR_CUSTOMER_SELECT);

    if (error) {
      setRows([]);
      setLoadError(error.message);
    } else {
      setRows((data ?? []) as ReminderCustomerRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const grouped = useMemo(() => {
    const items = buildNotificationItems(rows);
    const map = new Map<NotificationBucket, NotificationItem[]>();
    for (const b of BUCKET_ORDER) map.set(b, []);
    for (const item of items) {
      const list = map.get(item.bucket) ?? [];
      list.push(item);
      map.set(item.bucket, list);
    }
    return map;
  }, [rows]);

  const totalCount = useMemo(
    () => BUCKET_ORDER.reduce((n, b) => n + (grouped.get(b)?.length ?? 0), 0),
    [grouped],
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #02142b 0%, #06192f 50%, #003c42 100%)",
        color: "white",
        padding: isMobile ? "20px 16px" : "clamp(24px, 4vw, 40px)",
        overflowX: "hidden",
        boxSizing: "border-box",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? "1.75rem" : "2.5rem", fontWeight: 800 }}>{t.title}</h1>
          <p style={{ margin: "10px 0 0", color: "#8ea4c7", fontSize: isMobile ? 16 : 18 }}>{t.subtitle}</p>
        </div>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
          <Link
            href="/calendar"
            style={{
              padding: isMobile ? "14px 18px" : "12px 16px",
              borderRadius: 12,
              background: "#1a3557",
              color: "#e2e8f0",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 15,
              textAlign: "center",
            }}
          >
            {t.viewAllCalendar}
          </Link>
          <Link
            href="/"
            style={{
              padding: isMobile ? "14px 18px" : "12px 16px",
              borderRadius: 12,
              border: "1px solid #1e3a5f",
              background: "#102742",
              color: "#94a3b8",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 15,
              textAlign: "center",
            }}
          >
            {t.backHome}
          </Link>
        </div>
      </header>

      <BrowserNotificationBanner lang={lang} rows={rows} isMobile={isMobile} />

      {loadError ? (
        <p style={{ color: "#fecaca", marginBottom: 16 }}>{loadError}</p>
      ) : null}

      {loading ? (
        <p style={{ color: "#94a3b8" }}>{t.loading}</p>
      ) : totalCount === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 17 }}>{t.empty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {BUCKET_ORDER.map((bucket) => {
            const list = grouped.get(bucket) ?? [];
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
                        <p style={{ margin: "0 0 6px", fontSize: 15, color: "#94a3b8" }}>{customer.company_name}</p>
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
        </div>
      )}
    </main>
  );
}
