import { NextResponse } from "next/server";
import { sendLineReplyMessage } from "../../lib/lineMessaging";
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

const BIND_SUCCESS_REPLY =
  "綁定成功 ✅\n之後 CRM 提醒會傳到這個 LINE 帳號。";

const BIND_INSTRUCTION_REPLY =
  "我已收到您的訊息，目前請輸入「綁定」完成 LINE CRM 通知設定。";

function isTextMessageEvent(event: LineWebhookEvent): boolean {
  return event.type === "message" && event.message?.type === "text";
}

function isBindMessage(event: LineWebhookEvent): boolean {
  return isTextMessageEvent(event) && event.message?.text?.trim() === "綁定";
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

async function resolveChannelAccessToken(): Promise<string> {
  const settings = await loadLineReminderSettings();
  return process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || settings.channel_access_token.trim();
}

async function handleTextMessage(event: LineWebhookEvent, channelAccessToken: string): Promise<void> {
  const replyToken = event.replyToken?.trim();
  if (!replyToken) return;

  if (isBindMessage(event)) {
    const userId = event.source?.userId?.trim();
    if (!userId) {
      await sendLineReplyMessage(replyToken, BIND_INSTRUCTION_REPLY, channelAccessToken);
      return;
    }

    const displayName = await fetchLineDisplayName(userId, channelAccessToken);
    await bindLineUser(userId, displayName);
    await sendLineReplyMessage(replyToken, BIND_SUCCESS_REPLY, channelAccessToken);
    return;
  }

  await sendLineReplyMessage(replyToken, BIND_INSTRUCTION_REPLY, channelAccessToken);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LineWebhookBody;
    const events = body.events ?? [];
    const textEvents = events.filter(isTextMessageEvent);

    if (textEvents.length > 0) {
      const channelAccessToken = await resolveChannelAccessToken();
      await Promise.all(textEvents.map((event) => handleTextMessage(event, channelAccessToken)));
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("line-webhook error:", err);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
