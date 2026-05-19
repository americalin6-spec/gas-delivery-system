import { getSupabaseServer } from "./supabaseServer";
import {
  DEFAULT_LINE_REMINDER_SETTINGS,
  LINE_REMINDER_SETTINGS_KEY,
  normalizeLineReminderSettings,
  type LineReminderSettings,
} from "./lineReminderSettings";

function settingsFromEnv(): Partial<LineReminderSettings> {
  const channelAccessToken =
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? process.env.LINE_NOTIFY_TOKEN?.trim();
  const userId = process.env.LINE_USER_ID?.trim();
  const enabled = process.env.LINE_REMINDER_ENABLED === "true";
  const hour = Number(process.env.LINE_REMINDER_HOUR);
  return {
    ...(channelAccessToken ? { channel_access_token: channelAccessToken } : {}),
    ...(userId ? { user_id: userId } : {}),
    ...(process.env.LINE_REMINDER_ENABLED !== undefined ? { enabled } : {}),
    ...(Number.isFinite(hour) ? { notify_hour: hour } : {}),
  };
}

export async function loadLineReminderSettings(): Promise<LineReminderSettings> {
  const envOverlay = settingsFromEnv();
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", LINE_REMINDER_SETTINGS_KEY)
    .maybeSingle();

  if (error || !data?.value) {
    return normalizeLineReminderSettings({
      ...DEFAULT_LINE_REMINDER_SETTINGS,
      ...envOverlay,
    });
  }

  return normalizeLineReminderSettings({
    ...DEFAULT_LINE_REMINDER_SETTINGS,
    ...(data.value as object),
    ...envOverlay,
  });
}

export async function saveLineReminderSettings(
  patch: Partial<LineReminderSettings>,
): Promise<{ settings: LineReminderSettings; error?: string }> {
  const current = await loadLineReminderSettings();
  const next = normalizeLineReminderSettings({
    ...current,
    ...patch,
  });

  const supabase = getSupabaseServer();
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: LINE_REMINDER_SETTINGS_KEY,
      value: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    return { settings: current, error: error.message };
  }

  return { settings: next };
}

/** Asia/Taipei local hour (0–23) for scheduled send window. */
export function getTaipeiHour(now: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const hour = parts.find((p) => p.type === "hour")?.value;
    return hour ? Number(hour) : now.getHours();
  } catch {
    return now.getHours();
  }
}

export function shouldRunScheduledReminder(settings: LineReminderSettings, now: Date = new Date()): boolean {
  if (!settings.enabled) return false;
  if (!settings.channel_access_token.trim()) return false;
  if (!settings.user_id.trim()) return false;
  const taipeiHour = getTaipeiHour(now);
  if (taipeiHour !== settings.notify_hour) return false;
  const today = formatTodayTaipei(now);
  if (settings.last_sent_date === today) return false;
  return true;
}

function formatTodayTaipei(now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

export async function markReminderSentToday(): Promise<void> {
  const today = formatTodayTaipei(new Date());
  await saveLineReminderSettings({ last_sent_date: today });
}
