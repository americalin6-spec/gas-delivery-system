"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAppLang } from "../hooks/useAppLang";
import { useIsViewportBelow } from "../hooks/useViewportWidth";
import { lineReminderSettingsCopy } from "../lib/lineReminderI18n";

const MOBILE_MAX = 1024;

type SettingsResponse = {
  enabled: boolean;
  reminder_time: string;
  channel_access_token: string;
  user_id: string;
};

function reminderTimeToHour(reminderTime: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(reminderTime.trim());
  if (!m) return 9;
  const h = parseInt(m[1], 10);
  return Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 9;
}

export default function LineReminderSettingsPage() {
  const { lang } = useAppLang();
  const t = lineReminderSettingsCopy(lang);
  const isMobile = useIsViewportBelow(MOBILE_MAX);

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [notifyHour, setNotifyHour] = useState(9);
  const [channelAccessTokenInput, setChannelAccessTokenInput] = useState("");
  const [userId, setUserId] = useState("");
  const [channelAccessTokenSet, setChannelAccessTokenSet] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "run" | null>(null);
  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reminder-settings");
      if (!res.ok) throw new Error(t.loadError);
      const data = (await res.json()) as SettingsResponse;
      setEnabled(data.enabled);
      setNotifyHour(reminderTimeToHour(data.reminder_time));
      setChannelAccessTokenSet(Boolean(data.channel_access_token?.trim()));
      setUserId(data.user_id ?? "");
      setChannelAccessTokenInput("");
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [t.loadError]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function saveSettings() {
    setBusy("save");
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/reminder-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          reminder_time: `${String(notifyHour).padStart(2, "0")}:00`,
          user_id: userId.trim(),
          ...(channelAccessTokenInput.trim()
            ? { channel_access_token: channelAccessTokenInput.trim() }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? t.saveError);
      setChannelAccessTokenSet(Boolean(data.channel_access_token?.trim()));
      setUserId(data.user_id ?? "");
      setChannelAccessTokenInput("");
      setStatus(t.saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.saveError);
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/line-push-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_access_token: channelAccessTokenInput.trim() || undefined,
          user_id: userId.trim() || undefined,
          use_due_preview: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? t.testError);
      setStatus(t.testOk);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.testError);
    } finally {
      setBusy(null);
    }
  }

  async function runCheckNow() {
    setBusy("run");
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/reminder-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (!data.ok && !data.sent && data.reason !== "no_due_customers") {
        throw new Error(data.lineError ?? data.reason ?? t.testError);
      }
      setStatus(
        lang === "zh"
          ? `已執行（到期 ${data.dueCount ?? 0} 位${data.sent ? "，已發送 LINE" : ""}）`
          : `Done (${data.dueCount ?? 0} due${data.sent ? ", LINE sent" : ""})`,
      );
      void loadSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.testError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #02142b 0%, #06192f 50%, #003c42 100%)",
        color: "white",
        padding: isMobile ? "20px 16px" : "clamp(24px, 4vw, 40px)",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        boxSizing: "border-box",
      }}
    >
      <header style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <Link href="/alerts" style={{ color: "#93c5fd", textDecoration: "none", fontSize: 15 }}>
          {t.backAlerts}
        </Link>
        <Link href="/" style={{ color: "#93c5fd", textDecoration: "none", fontSize: 15 }}>
          {t.backHome}
        </Link>
      </header>

      <h1 style={{ margin: "0 0 8px", fontSize: isMobile ? 26 : 32 }}>{t.title}</h1>
      <p style={{ margin: "0 0 28px", opacity: 0.88, lineHeight: 1.6, maxWidth: 640 }}>{t.subtitle}</p>

      {loading ? (
        <p style={{ opacity: 0.8 }}>{lang === "zh" ? "載入中…" : "Loading…"}</p>
      ) : (
        <div
          style={{
            maxWidth: 560,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            background: "rgba(32, 51, 77, 0.85)",
            borderRadius: 16,
            padding: 24,
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            <span>
              <strong>{t.enabled}</strong>
              <span style={{ display: "block", fontSize: 14, opacity: 0.75, marginTop: 4 }}>{t.enabledHint}</span>
            </span>
          </label>

          <div>
            <label htmlFor="notify-hour" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
              {t.hourLabel}
            </label>
            <select
              id="notify-hour"
              value={notifyHour}
              onChange={(e) => setNotifyHour(Number(e.target.value))}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "#0f2744",
                color: "white",
                fontSize: 16,
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>{t.tokenLabel}</label>
            {channelAccessTokenSet ? (
              <p style={{ margin: "0 0 8px", fontSize: 14, opacity: 0.85 }}>
                {lang === "zh" ? "已儲存 Channel Access Token（輸入新值可覆寫）" : "Channel Access Token saved (enter a new value to replace)"}
              </p>
            ) : null}
            <input
              type="password"
              value={channelAccessTokenInput}
              onChange={(e) => setChannelAccessTokenInput(e.target.value)}
              placeholder={t.tokenPlaceholder}
              autoComplete="off"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "#0f2744",
                color: "white",
                fontSize: 16,
              }}
            />
            <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>{t.tokenHint}</p>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>{t.userIdLabel}</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder={t.userIdPlaceholder}
              autoComplete="off"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "#0f2744",
                color: "white",
                fontSize: 16,
              }}
            />
            <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>{t.userIdHint}</p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={busy !== null}
              style={{
                padding: "12px 20px",
                borderRadius: 10,
                border: "none",
                background: "#2563eb",
                color: "white",
                fontWeight: 600,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy === "save" ? t.saving : t.save}
            </button>
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={
                busy !== null ||
                ((!channelAccessTokenSet && !channelAccessTokenInput.trim()) || !userId.trim())
              }
              style={{
                padding: "12px 20px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.35)",
                background: "transparent",
                color: "white",
                fontWeight: 600,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy === "test" ? t.testSending : t.testSend}
            </button>
            <button
              type="button"
              onClick={() => void runCheckNow()}
              disabled={busy !== null}
              style={{
                padding: "12px 20px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.08)",
                color: "white",
                fontWeight: 600,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy === "run" ? t.running : t.runNow}
            </button>
          </div>

          {status ? (
            <p style={{ margin: 0, color: "#86efac", fontSize: 15 }}>{status}</p>
          ) : null}
          {error ? (
            <p style={{ margin: 0, color: "#fca5a5", fontSize: 15 }}>{error}</p>
          ) : null}

          <div
            style={{
              marginTop: 8,
              paddingTop: 16,
              borderTop: "1px solid rgba(255,255,255,0.12)",
              fontSize: 14,
              opacity: 0.85,
              lineHeight: 1.55,
            }}
          >
            <strong>{t.cronTitle}</strong>
            <p style={{ margin: "8px 0 0" }}>{t.cronBody}</p>
            <p style={{ margin: "12px 0 0", opacity: 0.75 }}>{t.futureNote}</p>
          </div>
        </div>
      )}
    </main>
  );
}
