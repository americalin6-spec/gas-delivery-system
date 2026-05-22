"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { BrowserNotificationBanner } from "../components/BrowserNotificationBanner";
import { CalendarMonthView, monthTitle } from "../components/CalendarMonthView";
import { ReminderCalendarGroups } from "../components/ReminderCalendarGroups";
import { useAppLang } from "../hooks/useAppLang";
import { useIsViewportBelow } from "../hooks/useViewportWidth";
import { customersInMonth } from "../lib/calendarMonth";
import { calendarPageCopy } from "../lib/calendarI18n";
import {
  CALENDAR_CUSTOMER_SELECT,
  filterCalendarCustomers,
  type ReminderCustomerRow,
} from "../lib/calendarReminders";
import { activeCustomersOnly } from "../lib/customerSoftDelete";
import { logActiveCompany } from "../lib/clientCompany";
import { useActiveCompany } from "../components/ActiveCompanyProvider";
import { supabase } from "../supabase";

const MOBILE_MAX = 1024;

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default function CalendarPage() {
  const { lang } = useAppLang();
  const t = calendarPageCopy(lang);
  const isMobile = useIsViewportBelow(MOBILE_MAX);

  const [customers, setCustomers] = useState<ReminderCustomerRow[]>([]);
  const [allRows, setAllRows] = useState<ReminderCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const { companyId, ready: companyReady } = useActiveCompany();

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const fetchCustomers = useCallback(async () => {
    if (!companyReady || companyId <= 0) return;
    setLoading(true);
    setLoadError(null);
    logActiveCompany("calendar.load", { companyId });

    const { data, error } = await activeCustomersOnly(
      supabase.from("customers").select(CALENDAR_CUSTOMER_SELECT).eq("company_id", companyId),
    ).order("follow_up_date", { ascending: true, nullsFirst: false });

    if (error) {
      console.error(error);
      setCustomers([]);
      setAllRows([]);
      setLoadError(error.message);
    } else {
      const rows = (data ?? []) as ReminderCustomerRow[];
      setAllRows(rows);
      setCustomers(filterCalendarCustomers(rows));
    }

    setLoading(false);
  }, [companyId, companyReady]);

  useEffect(() => {
    if (!companyReady || companyId <= 0) return;
    void fetchCustomers();
  }, [fetchCustomers, companyReady, companyId]);

  const monthCustomers = useMemo(
    () => customersInMonth(customers, viewYear, viewMonth),
    [customers, viewYear, viewMonth],
  );


  function goPrevMonth() {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  function goNextMonth() {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  function goToday() {
    setViewDate(startOfMonth(new Date()));
  }

  const navBtn: CSSProperties = {
    padding: isMobile ? "12px 14px" : "10px 16px",
    borderRadius: 10,
    border: "1px solid #1e3a5f",
    background: "#102742",
    color: "#e2e8f0",
    fontWeight: 700,
    fontSize: isMobile ? 15 : 14,
    cursor: "pointer",
    minHeight: isMobile ? 44 : undefined,
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #02142b 0%, #06192f 50%, #003c42 100%)",
        color: "white",
        padding: isMobile ? "20px 16px" : "clamp(24px, 4vw, 40px)",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        overflowX: "hidden",
        boxSizing: "border-box",
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: isMobile ? 20 : 24,
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 200px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? "1.75rem" : "clamp(2rem, 5vw, 2.75rem)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            {t.title}
          </h1>
          <p style={{ margin: "12px 0 0", color: "#8ea4c7", fontSize: isMobile ? 16 : 18, lineHeight: 1.55 }}>
            {t.subtitle(monthCustomers.length, loading)}
          </p>
        </div>
        <Link
          href="/"
          style={{
            color: "#94a3b8",
            textDecoration: "none",
            fontSize: 16,
            fontWeight: 600,
            padding: isMobile ? "14px 18px" : "12px 18px",
            borderRadius: 12,
            border: "1px solid #1e3a5f",
            background: "#102742",
            flexShrink: 0,
          }}
        >
          {t.backHome}
        </Link>
      </header>

      <BrowserNotificationBanner lang={lang} rows={allRows} isMobile={isMobile} />

      <ReminderCalendarGroups customers={customers} lang={lang} isMobile={isMobile} />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: isMobile ? 20 : 24,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" onClick={goPrevMonth} style={navBtn}>
            {t.prevMonth}
          </button>
          <button type="button" onClick={goToday} style={{ ...navBtn, background: "#1a3557", borderColor: "#6366f1" }}>
            {t.today}
          </button>
          <button type="button" onClick={goNextMonth} style={navBtn}>
            {t.nextMonth}
          </button>
        </div>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 800, width: isMobile ? "100%" : "auto" }}>
          {monthTitle(viewYear, viewMonth, lang)}
        </h2>
      </div>

      {loadError ? (
        <p
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 12,
            background: "rgba(127,29,29,0.35)",
            border: "1px solid rgba(239,68,68,0.5)",
            color: "#fecaca",
            fontSize: 15,
            lineHeight: 1.55,
          }}
        >
          {loadError}
          <br />
          <span style={{ opacity: 0.9 }}>{t.sqlHint}</span>
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: "#94a3b8", fontSize: 17 }}>{t.loading}</p>
      ) : customers.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 17, lineHeight: 1.6 }}>{t.empty}</p>
      ) : (
        <CalendarMonthView
          customers={monthCustomers}
          lang={lang}
          isMobile={isMobile}
          viewYear={viewYear}
          viewMonth={viewMonth}
          labels={{
            noRemindersThisMonth: t.noRemindersThisMonth,
            mobileDateList: t.mobileDateList,
            unnamed: t.unnamed,
          }}
        />
      )}
    </main>
  );
}
