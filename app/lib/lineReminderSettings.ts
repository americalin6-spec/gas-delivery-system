/** LINE CRM follow-up reminder settings (stored in Supabase `app_settings.line_reminder`). */

export const LINE_REMINDER_SETTINGS_KEY = "line_reminder";

export type LineReminderSettings = {
  enabled: boolean;
  channel_access_token: string;
  user_id: string;
  /** Local hour 0–23 (default 9 = 09:00) */
  notify_hour: number;
  last_sent_date: string | null;
};

export const DEFAULT_LINE_REMINDER_SETTINGS: LineReminderSettings = {
  enabled: false,
  channel_access_token: "",
  user_id: "",
  notify_hour: 9,
  last_sent_date: null,
};

export function normalizeLineReminderSettings(raw: unknown): LineReminderSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_LINE_REMINDER_SETTINGS };
  const o = raw as Record<string, unknown>;
  const hour = Number(o.notify_hour);
  const channelAccessToken =
    typeof o.channel_access_token === "string"
      ? o.channel_access_token.trim()
      : typeof o.notify_token === "string"
        ? o.notify_token.trim()
        : "";
  return {
    enabled: Boolean(o.enabled),
    channel_access_token: channelAccessToken,
    user_id: typeof o.user_id === "string" ? o.user_id.trim() : "",
    notify_hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 9,
    last_sent_date: typeof o.last_sent_date === "string" ? o.last_sent_date : null,
  };
}

export function maskSecret(value: string): string {
  const t = value.trim();
  if (!t) return "";
  if (t.length <= 8) return "••••••••";
  return `${t.slice(0, 4)}••••${t.slice(-4)}`;
}
