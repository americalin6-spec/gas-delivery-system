import { NextResponse } from "next/server";
import { maskSecret } from "../../app/lib/lineReminderSettings";
import {
  loadLineReminderSettings,
  saveLineReminderSettings,
} from "../../app/lib/lineReminderSettingsServer";

export async function GET() {
  try {
    const settings = await loadLineReminderSettings();
    return NextResponse.json({
      enabled: settings.enabled,
      notify_hour: settings.notify_hour,
      channel_access_token_set: settings.channel_access_token.length > 0,
      channel_access_token_masked: maskSecret(settings.channel_access_token),
      user_id: settings.user_id,
      last_sent_date: settings.last_sent_date,
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
      channel_access_token?: string;
      user_id?: string;
      notify_hour?: number;
      clear_channel_access_token?: boolean;
    };

    const patch: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.notify_hour === "number") patch.notify_hour = body.notify_hour;
    if (typeof body.user_id === "string") patch.user_id = body.user_id.trim();
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
      notify_hour: settings.notify_hour,
      channel_access_token_set: settings.channel_access_token.length > 0,
      channel_access_token_masked: maskSecret(settings.channel_access_token),
      user_id: settings.user_id,
      last_sent_date: settings.last_sent_date,
    });
  } catch (err) {
    console.error("reminder-settings POST", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
