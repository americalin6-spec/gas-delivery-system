import { NextResponse } from "next/server";
import {
  loadLineReminderSettings,
  saveLineReminderSettings,
} from "../../lib/lineReminderSettingsServer";

function hourToReminderTime(hour: number): string {
  const h = Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 9;
  return `${String(h).padStart(2, "0")}:00`;
}

function parseReminderTimeToHour(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(23, Math.max(0, value));
  }
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) {
    const h = parseInt(m[1], 10);
    return Math.min(23, Math.max(0, h));
  }
  const n = parseInt(t, 10);
  if (Number.isFinite(n)) return Math.min(23, Math.max(0, n));
  return undefined;
}

export async function GET() {
  try {
    const settings = await loadLineReminderSettings();
    return NextResponse.json({
      enabled: settings.enabled,
      reminder_time: hourToReminderTime(settings.notify_hour),
      channel_access_token: settings.channel_access_token,
      user_id: settings.user_id,
    });
  } catch (err) {
    console.error("reminder-settings GET", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      enabled?: boolean;
      reminder_time?: string | number;
      notify_hour?: number;
      channel_access_token?: string;
      user_id?: string;
      clear_channel_access_token?: boolean;
    };

    const patch: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.user_id === "string") patch.user_id = body.user_id.trim();

    const hourFromReminder = parseReminderTimeToHour(body.reminder_time);
    if (hourFromReminder !== undefined) {
      patch.notify_hour = hourFromReminder;
    } else if (typeof body.notify_hour === "number") {
      patch.notify_hour = Math.min(23, Math.max(0, body.notify_hour));
    }

    if (body.clear_channel_access_token) patch.channel_access_token = "";
    else if (typeof body.channel_access_token === "string" && body.channel_access_token.trim()) {
      patch.channel_access_token = body.channel_access_token.trim();
    }

    const { settings, error } = await saveLineReminderSettings(patch);

    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      enabled: settings.enabled,
      reminder_time: hourToReminderTime(settings.notify_hour),
      channel_access_token: settings.channel_access_token,
      user_id: settings.user_id,
    });
  } catch (err) {
    console.error("reminder-settings POST", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
