import { NextResponse } from "next/server";
import { loadLineReminderSettings } from "../../lib/lineReminderSettingsServer";
import { getSupabaseServer } from "../../lib/supabaseServer";

type LineWebhookBody = {
  events?: LineWebhookEvent[];
};

type LineWebhookEvent = {
  type?: string;
  replyToken?: string;
  source?: {
    type?: string;
    userId?: string;
  };
  message?: {
    type?: string;
    text?: string;
  };
};

type LineProfile = {
  displayName?: string;
};

const LINE_PROFILE_ENDPOINT = "https://api.line.me/v2/bot/profile";

function isBindMessage(event: LineWebhookEvent): boolean {
  return event.type === "message" && event.message?.type === "text" && event.message.text?.trim() === "綁定";
}

async function fetchLineDisplayName(userId: string, channelAccessToken: string): Promise<string | null> {
  const token = channelAccessToken.trim();
  if (!token) return null;

  const res = await fetch(`${LINE_PROFILE_ENDPOINT}/${encodeURIComponent(userId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    console.error("LINE profile fetch failed:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const profile = (await res.json()) as LineProfile;
  return profile.displayName?.trim() || null;
}

async function bindLineUser(userId: string, displayName: string | null): Promise<void> {
  const supabase = getSupabaseServer();
  const { error } = await supabase.from("line_users").upsert(
    {
      line_user_id: userId,
      display_name: displayName,
    },
    { onConflict: "line_user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LineWebhookBody;
    const events = body.events ?? [];
    const bindEvents = events.filter(isBindMessage);

    if (bindEvents.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const settings = await loadLineReminderSettings();
    const channelAccessToken =
      process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || settings.channel_access_token.trim();

    await Promise.all(
      bindEvents.map(async (event) => {
        const userId = event.source?.userId?.trim();
        if (!userId) return;

        const displayName = await fetchLineDisplayName(userId, channelAccessToken);
        await bindLineUser(userId, displayName);
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("line-webhook error:", err);
    // LINE retries non-2xx responses, so acknowledge the webhook after logging.
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
