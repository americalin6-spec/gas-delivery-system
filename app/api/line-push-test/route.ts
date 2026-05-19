import { NextResponse } from "next/server";
import { sendLinePushMessage } from "../../lib/lineMessaging";
import { loadLineReminderSettings } from "../../lib/lineReminderSettingsServer";
import { formatLineReminderMessage } from "../../lib/reminderCheck";
import { fetchDueReminderCustomers } from "../../lib/runReminderCheck";

/** Send a test LINE Messaging API push to the configured personal User ID. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      channel_access_token?: string;
      user_id?: string;
      message?: string;
      use_due_preview?: boolean;
    };

    const settings = await loadLineReminderSettings();
    const channelAccessToken = (
      body.channel_access_token?.trim() || settings.channel_access_token
    ).trim();
    const userId = (body.user_id?.trim() || settings.user_id).trim();

    if (!channelAccessToken) {
      return NextResponse.json(
        { ok: false, error: "Channel Access Token is required" },
        { status: 400 },
      );
    }
    if (!userId) {
      return NextResponse.json({ ok: false, error: "User ID is required" }, { status: 400 });
    }

    let message = body.message?.trim() ?? "";
    if (body.use_due_preview || !message) {
      const due = await fetchDueReminderCustomers();
      message = formatLineReminderMessage(due, "zh");
    }

    const result = await sendLinePushMessage(message, channelAccessToken, userId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, preview: message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, preview: message });
  } catch (err) {
    console.error("line-push-test", err);
    return NextResponse.json({ ok: false, error: "Test push failed" }, { status: 500 });
  }
}
