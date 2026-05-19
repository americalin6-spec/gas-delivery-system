/** LINE Messaging API push helper (Bot -> your own LINE user ID). */

const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";

export type LinePushResult = {
  ok: boolean;
  status: number;
  error?: string;
};

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

  try {
    const res = await fetch(LINE_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        messages: [{ type: "text", text: text.slice(0, 5000) }],
      }),
    });

    if (res.ok) return { ok: true, status: res.status };

    let error = `LINE Messaging API HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { message?: string; details?: unknown };
      if (json.message) error = json.message;
      if (json.details) error = `${error}: ${JSON.stringify(json.details).slice(0, 300)}`;
    } catch {
      const body = await res.text().catch(() => "");
      if (body) error = body.slice(0, 300);
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
