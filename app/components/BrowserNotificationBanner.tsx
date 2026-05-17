"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppLang } from "../lib/appLang";
import { browserNotificationCopy } from "../lib/calendarI18n";
import type { ReminderCustomerRow } from "../lib/calendarReminders";
import {
  dispatchCrmBrowserNotifications,
  getBrowserNotificationPermission,
  isBrowserNotificationSupported,
  requestBrowserNotificationPermission,
} from "../lib/crmBrowserNotifications";

export function BrowserNotificationBanner({
  lang,
  rows,
  isMobile,
}: {
  lang: AppLang;
  rows: ReminderCustomerRow[];
  isMobile?: boolean;
}) {
  const t = browserNotificationCopy(lang);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);
  const [lastShown, setLastShown] = useState<number | null>(null);

  useEffect(() => {
    setPermission(getBrowserNotificationPermission());
  }, []);

  const tryDispatch = useCallback(
    (nextPermission: NotificationPermission | "unsupported") => {
      if (nextPermission !== "granted" || rows.length === 0) return;
      const n = dispatchCrmBrowserNotifications(rows, lang);
      setLastShown(n);
    },
    [rows, lang],
  );

  useEffect(() => {
    if (permission === "granted" && rows.length > 0) {
      tryDispatch("granted");
    }
  }, [permission, rows, tryDispatch]);

  async function handleEnable() {
    setBusy(true);
    const result = await requestBrowserNotificationPermission();
    setPermission(result);
    setBusy(false);
    if (result === "granted") tryDispatch("granted");
  }

  if (!isBrowserNotificationSupported()) {
    return (
      <p
        style={{
          margin: "0 0 20px",
          padding: isMobile ? 14 : 16,
          borderRadius: 12,
          background: "rgba(51,65,85,0.5)",
          color: "#94a3b8",
          fontSize: isMobile ? 15 : 14,
          lineHeight: 1.55,
        }}
      >
        {t.unsupported}
      </p>
    );
  }

  if (permission === "granted") {
    return (
      <p
        style={{
          margin: "0 0 20px",
          padding: isMobile ? 14 : 16,
          borderRadius: 12,
          background: "rgba(20,83,45,0.35)",
          border: "1px solid rgba(34,197,94,0.45)",
          color: "#bbf7d0",
          fontSize: isMobile ? 15 : 14,
        }}
      >
        {t.enabled}
        {lastShown !== null && lastShown > 0
          ? lang === "zh"
            ? `（本次已推送 ${lastShown} 則）`
            : ` (${lastShown} sent this visit)`
          : null}
      </p>
    );
  }

  if (permission === "denied") {
    return (
      <p
        style={{
          margin: "0 0 20px",
          padding: isMobile ? 14 : 16,
          borderRadius: 12,
          background: "rgba(127,29,29,0.25)",
          border: "1px solid rgba(239,68,68,0.4)",
          color: "#fecaca",
          fontSize: isMobile ? 15 : 14,
          lineHeight: 1.55,
        }}
      >
        {t.denied}
      </p>
    );
  }

  return (
    <div
      style={{
        margin: "0 0 20px",
        padding: isMobile ? 16 : 18,
        borderRadius: 14,
        background: "rgba(30,58,95,0.65)",
        border: "1px solid rgba(129,140,248,0.35)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        justifyContent: "space-between",
      }}
    >
      <p style={{ margin: 0, flex: "1 1 200px", fontSize: isMobile ? 15 : 14, lineHeight: 1.55, color: "#cbd5e1" }}>
        {t.prompt}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleEnable()}
        style={{
          flex: isMobile ? "1 1 100%" : "0 0 auto",
          padding: isMobile ? "14px 20px" : "12px 18px",
          borderRadius: 12,
          border: "none",
          background: "#6366f1",
          color: "#fff",
          fontWeight: 700,
          fontSize: isMobile ? 16 : 15,
          cursor: busy ? "wait" : "pointer",
          minHeight: isMobile ? 48 : undefined,
        }}
      >
        {busy ? t.requesting : t.enable}
      </button>
    </div>
  );
}
