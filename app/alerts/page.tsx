"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BrowserNotificationBanner } from "../components/BrowserNotificationBanner";
import { NotificationCenter } from "../components/NotificationCenter";
import { useAppLang } from "../hooks/useAppLang";
import { useIsViewportBelow } from "../hooks/useViewportWidth";
import {
  CALENDAR_CUSTOMER_SELECT,
  NOTIFICATION_CENTER_LIMIT,
  type ReminderCustomerRow,
} from "../lib/calendarReminders";
import { alertsPageCopy } from "../lib/calendarI18n";
import { activeCustomersOnly } from "../lib/customerSoftDelete";
import { logActiveCompany } from "../lib/clientCompany";
import { useActiveCompany } from "../components/ActiveCompanyProvider";
import { supabase } from "../supabase";

const MOBILE_MAX = 1024;

export default function AlertsPage() {
  const { lang } = useAppLang();
  const t = alertsPageCopy(lang);
  const isMobile = useIsViewportBelow(MOBILE_MAX);

  const [rows, setRows] = useState<ReminderCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { companyId, ready: companyReady } = useActiveCompany();

  const fetchRows = useCallback(async () => {
    if (!companyReady || companyId <= 0) return;
    setLoading(true);
    setLoadError(null);
    logActiveCompany("alerts.load", { companyId });
    const { data, error } = await activeCustomersOnly(
      supabase.from("customers").select(CALENDAR_CUSTOMER_SELECT).eq("company_id", companyId),
    );

    if (error) {
      setRows([]);
      setLoadError(error.message);
    } else {
      setRows((data ?? []) as ReminderCustomerRow[]);
    }
    setLoading(false);
  }, [companyId, companyReady]);

  useEffect(() => {
    if (!companyReady || companyId <= 0) return;
    void fetchRows();
  }, [fetchRows, companyReady, companyId]);

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
            href="/alerts/all"
            style={{
              padding: isMobile ? "14px 18px" : "12px 16px",
              borderRadius: 12,
              background: "#6366f1",
              color: "#eef2ff",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 15,
              textAlign: "center",
            }}
          >
            {t.viewAllNotifications}
          </Link>
          <Link
            href="/settings"
            style={{
              padding: isMobile ? "14px 18px" : "12px 16px",
              borderRadius: 12,
              background: "#0d9488",
              color: "#ecfdf5",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 15,
              textAlign: "center",
            }}
          >
            {t.lineNotifySettings}
          </Link>
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

      {loadError ? <p style={{ color: "#fecaca", marginBottom: 16 }}>{loadError}</p> : null}

      {loading ? (
        <p style={{ color: "#94a3b8" }}>{t.loading}</p>
      ) : (
        <NotificationCenter rows={rows} lang={lang} isMobile={isMobile} limit={NOTIFICATION_CENTER_LIMIT} />
      )}
    </main>
  );
}
