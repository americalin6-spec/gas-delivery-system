"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useActiveCompany } from "./ActiveCompanyProvider";
import { useAuthSession } from "../hooks/useAuthSession";
import { canQueryTenantCustomers } from "../lib/tenantClientAuth";
import { useAppLang } from "../hooks/useAppLang";
import { useIsViewportBelow } from "../hooks/useViewportWidth";
import { COMPANY_HEADER_NAME } from "../lib/companyContext";
import type { CrmNotificationRow } from "../lib/crmNotifications";
import {
  crmNotificationBellCopy,
  crmNotificationTypeAccent,
  crmNotificationTypeLabel,
} from "../lib/crmNotificationsI18n";
import { showInternalCrmNav } from "../lib/crmNavVisibility";

const MOBILE_MAX = 1024;
const POLL_MS = 45_000;

function formatRelativeTime(iso: string, lang: "zh" | "en"): string {
  const t = crmNotificationBellCopy(lang);
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return t.justNow;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return t.minutesAgo(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 48) return t.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  return t.daysAgo(days);
}

export function CrmNotificationBell() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang } = useAppLang();
  const t = crmNotificationBellCopy(lang);
  const isMobile = useIsViewportBelow(MOBILE_MAX);
  const { user, loading: authLoading } = useAuthSession();
  const { companyId, ready: companyReady } = useActiveCompany();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CrmNotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const notifInFlightRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (
      !canQueryTenantCustomers({
        sessionUserId: user?.id,
        companyId,
        companyReady,
        pathname,
      }) ||
      notifInFlightRef.current
    ) {
      return;
    }
    notifInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications", {
        headers: { [COMPANY_HEADER_NAME]: String(companyId) },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        items?: CrmNotificationRow[];
        unreadCount?: number;
        error?: string;
      };
      const loadError = lang === "zh" ? "無法載入通知" : "Could not load notifications";
      if (!res.ok || !data.ok) {
        setError(data.error ?? loadError);
        return;
      }
      setItems(data.items ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      setError(lang === "zh" ? "無法載入通知" : "Could not load notifications");
    } finally {
      setLoading(false);
      notifInFlightRef.current = false;
    }
  }, [companyId, companyReady, lang, pathname, user?.id]);

  useEffect(() => {
    if (
      !canQueryTenantCustomers({
        sessionUserId: user?.id,
        companyId,
        companyReady,
        pathname,
      })
    ) {
      return;
    }
    void fetchNotifications();
    const id = window.setInterval(() => void fetchNotifications(), POLL_MS);
    return () => window.clearInterval(id);
  }, [companyReady, companyId, fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        btnRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const mayQuery = canQueryTenantCustomers({
    sessionUserId: user?.id,
    companyId,
    companyReady,
    pathname,
  });

  if (authLoading || !mayQuery) {
    return null;
  }

  async function markRead(id: number) {
    if (companyId <= 0) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        [COMPANY_HEADER_NAME]: String(companyId),
      },
      body: JSON.stringify({ id }),
    });
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    if (companyId <= 0) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        [COMPANY_HEADER_NAME]: String(companyId),
      },
      body: JSON.stringify({ all: true }),
    });
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    setUnreadCount(0);
  }

  async function handleItemClick(item: CrmNotificationRow) {
    if (item.read_at == null) {
      await markRead(item.id);
    }
    setOpen(false);
    if (item.customer_id) {
      router.push(`/customers/${item.customer_id}`);
    } else {
      router.push("/customers");
    }
  }

  const badge =
    unreadCount > 0 ? (
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          minWidth: 18,
          height: 18,
          padding: "0 5px",
          borderRadius: 999,
          background: "#ef4444",
          color: "#fff",
          fontSize: 11,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 0 2px rgba(2,20,43,0.95)",
        }}
      >
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    ) : null;

  return (
    <div
      style={{
        position: "fixed",
        top: isMobile ? "max(12px, env(safe-area-inset-top))" : 16,
        right: isMobile ? "max(12px, env(safe-area-inset-right))" : 20,
        zIndex: 9000,
      }}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label={t.ariaLabel}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void fetchNotifications();
        }}
        style={{
          position: "relative",
          width: isMobile ? 44 : 48,
          height: isMobile ? 44 : 48,
          borderRadius: 14,
          border: "1px solid rgba(129,140,248,0.45)",
          background:
            "linear-gradient(145deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)",
          color: "#e2e8f0",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3a5 5 0 0 0-5 5v2.5c0 .9-.3 1.8-.8 2.5L4.5 15.5A1.5 1.5 0 0 0 6 18h12a1.5 1.5 0 0 0 1.3-2.5l-1.7-2.5c-.5-.7-.8-1.6-.8-2.5V8a5 5 0 0 0-5-5Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path
            d="M10 20a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
        {badge}
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t.panelTitle}
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: isMobile ? "min(calc(100vw - 24px), 360px)" : 380,
            maxHeight: isMobile ? "min(70vh, 480px)" : 520,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            borderRadius: 16,
            border: "1px solid rgba(129,140,248,0.4)",
            background:
              "linear-gradient(160deg, rgba(15,23,42,0.98) 0%, rgba(2,20,43,0.99) 100%)",
            boxShadow: "0 24px 56px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 16, color: "#f1f5f9" }}>{t.panelTitle}</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                style={{
                  border: "none",
                  background: "rgba(99,102,241,0.2)",
                  color: "#c7d2fe",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {t.markAllRead}
              </button>
            ) : null}
          </div>

          <div style={{ overflowY: "auto", flex: 1, padding: 10 }}>
            {loading && items.length === 0 ? (
              <p style={{ margin: 12, color: "#94a3b8", fontSize: 14 }}>{t.loading}</p>
            ) : null}
            {error ? (
              <p style={{ margin: 12, color: "#fca5a5", fontSize: 14 }}>{error}</p>
            ) : null}
            {!loading && !error && items.length === 0 ? (
              <p style={{ margin: 12, color: "#94a3b8", fontSize: 14 }}>{t.empty}</p>
            ) : null}
            {items.map((item) => {
              const accent = crmNotificationTypeAccent(item.type);
              const unread = item.read_at == null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleItemClick(item)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    marginBottom: 8,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: `1px solid ${accent.border}`,
                    background: accent.bg,
                    cursor: "pointer",
                    boxSizing: "border-box",
                    opacity: unread ? 1 : 0.72,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: accent.dot,
                        marginTop: 6,
                        flexShrink: 0,
                        boxShadow: unread ? `0 0 8px ${accent.dot}` : "none",
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          alignItems: "flex-start",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 14,
                            color: "#f8fafc",
                            lineHeight: 1.4,
                          }}
                        >
                          {item.title}
                        </span>
                        <span style={{ fontSize: 11, color: "#64748b", flexShrink: 0 }}>
                          {formatRelativeTime(item.created_at, lang)}
                        </span>
                      </div>
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#94a3b8",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {crmNotificationTypeLabel(item.type, lang)}
                      </span>
                      {item.body ? (
                        <p
                          style={{
                            margin: "6px 0 0",
                            fontSize: 13,
                            color: "#cbd5e1",
                            lineHeight: 1.45,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {item.body}
                        </p>
                      ) : null}
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#86efac",
                        }}
                      >
                        {t.viewCustomer} →
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {showInternalCrmNav() ? (
            <div
              style={{
                padding: "10px 14px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <Link
                href="/alerts"
                onClick={() => setOpen(false)}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#a5b4fc",
                  textDecoration: "none",
                }}
              >
                {t.viewAll} →
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
