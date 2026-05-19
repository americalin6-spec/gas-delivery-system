/** LINE Messaging API helpers (push + reply). */

const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";

export type LinePushResult = {
  ok: boolean;
  status: number;
  error?: string;
};

async function lineMessagingRequest(
  endpoint: string,
  token: string,
  body: Record<string, unknown>,
): Promise<LinePushResult> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) return { ok: true, status: res.status };

    let error = `LINE Messaging API HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { message?: string; details?: unknown };
      if (json.message) error = json.message;
      if (json.details) error = `${error}: ${JSON.stringify(json.details).slice(0, 300)}`;
    } catch {
      const text = await res.text().catch(() => "");
      if (text) error = text.slice(0, 300);
    }

    return { ok: false, status: res.status, error };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendLinePushMessage(
  message: string,
  channelAccessToken: string,
  userId: string,
): Promise<LinePushResult> {
  const token = channelAccessToken.trim();
  const to = userId.trim();
  const text = message.trim();

  if (!token) return { ok: false, status: 0, error: "LINE Channel Access Token is empty" };
  if (!to) return { ok: false, status: 0, error: "LINE User ID is empty" };
  if (!text) return { ok: false, status: 0, error: "Message is empty" };

  return lineMessagingRequest(LINE_PUSH_ENDPOINT, token, {
    to,
    messages: [{ type: "text", text: text.slice(0, 5000) }],
  });
}

/** Reply to a webhook event using its one-time replyToken. */
export async function sendLineReplyMessage(
  replyToken: string,
  message: string,
  channelAccessToken: string,
): Promise<LinePushResult> {
  const token = channelAccessToken.trim();
  const reply = replyToken.trim();
  const text = message.trim();

  if (!token) return { ok: false, status: 0, error: "LINE Channel Access Token is empty" };
  if (!reply) return { ok: false, status: 0, error: "LINE replyToken is empty" };
  if (!text) return { ok: false, status: 0, error: "Message is empty" };

  return lineMessagingRequest(LINE_REPLY_ENDPOINT, token, {
    replyToken: reply,
    messages: [{ type: "text", text: text.slice(0, 5000) }],
  });
}
