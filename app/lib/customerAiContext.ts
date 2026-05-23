import { customerStatusLabel, normalizeCustomerStatus } from "./customerStatus";

export type ConversationRow = {
  direction?: string | null;
  message_text?: string | null;
  created_at?: string | null;
};

export function formatConversationRows(rows: ConversationRow[]): string {
  return rows
    .map((row) => {
      const dir = row.direction === "outbound" ? "我方" : "客戶";
      const msg = String(row.message_text ?? "").trim();
      return msg ? `${dir}：${msg}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export type ConversationEngagement = {
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  daysSinceInbound: number | null;
  noRecentReply: boolean;
};

const NO_REPLY_DAYS = 3;

export function analyzeConversationEngagement(
  rows: ConversationRow[],
): ConversationEngagement {
  let lastInboundAt: string | null = null;
  let lastOutboundAt: string | null = null;

  for (const row of rows) {
    const at = row.created_at?.toString().trim();
    if (!at) continue;
    if (row.direction === "outbound") {
      if (!lastOutboundAt || at > lastOutboundAt) lastOutboundAt = at;
    } else {
      if (!lastInboundAt || at > lastInboundAt) lastInboundAt = at;
    }
  }

  let daysSinceInbound: number | null = null;
  if (lastInboundAt) {
    const ms = Date.now() - new Date(lastInboundAt).getTime();
    daysSinceInbound = Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  const noRecentReply =
    rows.length > 0 &&
    (lastInboundAt == null ||
      (daysSinceInbound != null && daysSinceInbound >= NO_REPLY_DAYS) ||
      (lastOutboundAt != null &&
        lastInboundAt != null &&
        lastOutboundAt > lastInboundAt &&
        daysSinceInbound != null &&
        daysSinceInbound >= 1));

  return {
    lastInboundAt,
    lastOutboundAt,
    daysSinceInbound,
    noRecentReply,
  };
}

function cleanField(value: unknown, maxLen = 800): string {
  const t = String(value ?? "").trim();
  if (!t || t === "--" || t === "-" || t === "未提供") return "";
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

function truncateConversation(text: string, max = 14_000): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n…（對話已截斷）`;
}

export function buildCustomerAiContextBlock(
  customer: Record<string, unknown>,
  conversationText: string,
  engagement?: ConversationEngagement,
): string {
  const status = normalizeCustomerStatus(
    customer.customer_status ?? customer.status,
  );
  const statusLabel = customerStatusLabel(status, "zh");

  const lines: string[] = [
    "【CRM 客戶資料】",
    `姓名：${cleanField(customer.customer_name) || "未命名"}`,
    `客戶狀態：${statusLabel}`,
    `需求：${cleanField(customer.customer_need) || "—"}`,
    `情緒：${cleanField(customer.customer_emotion) || "—"}`,
    `成交機率：${cleanField(customer.success_rate) || "—"}`,
    `客戶等級：${cleanField(customer.customer_level) || "—"}`,
    `流失風險：${cleanField(customer.churn_risk) || "—"}`,
    `下一步：${cleanField(customer.next_step) || "—"}`,
    `追蹤訊息：${cleanField(customer.follow_up) || "—"}`,
    `備註：${cleanField(customer.note) || "—"}`,
    `最後聯絡：${cleanField(customer.last_contacted_at) || "—"}`,
  ];

  if (engagement) {
    lines.push(
      "",
      "【互動狀態】",
      `最後客戶回覆：${engagement.lastInboundAt || "無"}`,
      `最後我方訊息：${engagement.lastOutboundAt || "無"}`,
      engagement.daysSinceInbound != null
        ? `距上次客戶回覆：${engagement.daysSinceInbound} 天`
        : "距上次客戶回覆：未知",
      engagement.noRecentReply
        ? "⚠ 客戶近期未回覆，需主動喚回"
        : "客戶近期有互動或尚無對話",
    );
  }

  const conv = truncateConversation(conversationText);
  lines.push("", "【LINE 對話紀錄】", conv || "（尚無對話內容）");

  return lines.join("\n");
}
