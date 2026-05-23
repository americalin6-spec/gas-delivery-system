import { isHighDealProbability } from "./followUpReminders";
import type { ConversationEngagement } from "./customerAiContext";
import { formatAiSummaryUpdatedAt } from "./customerAiSummary";

export type FollowUpUrgencyLevel = "high" | "medium" | "low";

export type CustomerAiFollowUp = {
  suggestedFollowUpTime: string;
  suggestedMessage: string;
  suggestedAction: string;
  closingStrategy: string;
  urgencyLevel: FollowUpUrgencyLevel;
  reEngagement: boolean;
  updatedAt: string;
};

const NOT_PROVIDED = "尚無明確資料";

function cleanField(value: unknown, maxLen = 1200): string {
  const t = String(value ?? "").trim();
  if (!t || t === "--" || t === "-" || t === "未提供") return "";
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

function normalizeUrgency(raw: unknown, fallback: FollowUpUrgencyLevel): FollowUpUrgencyLevel {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (t === "high" || t === "高") return "high";
  if (t === "medium" || t === "中" || t === "mid") return "medium";
  if (t === "low" || t === "低") return "low";
  return fallback;
}

export function inferFollowUpUrgency(
  customer: Record<string, unknown>,
  engagement: ConversationEngagement,
  aiLevel?: FollowUpUrgencyLevel,
): FollowUpUrgencyLevel {
  if (aiLevel) return aiLevel;
  if (customer.urgent === true || engagement.noRecentReply) return "high";
  if (isHighDealProbability(customer.success_rate)) return "high";
  const churn = String(customer.churn_risk ?? "").trim();
  if (churn.includes("高")) return "high";
  return "medium";
}

export function buildCustomerAiFollowUpPrompt(
  context: string,
  engagement: ConversationEngagement,
): string {
  const reEngageHint = engagement.noRecentReply
    ? "客戶近期未回覆：suggestedMessage 必須是溫和、不施壓的喚回訊息（開場＋價值提醒＋明確但輕量的 CTA），reEngagement 設為 true。"
    : "客戶近期有互動：suggestedMessage 為延續對話的跟進訊息，reEngagement 設為 false。";

  return `你是一位資深 CRM 業務教練。請根據以下資料產出「AI 跟進建議」（繁體中文）。

分析重點：LINE 對話、客戶情緒、成交機率、客戶狀態、客戶需求。

規則：
1. 僅根據提供資料推論，勿捏造
2. suggestedFollowUpTime：具體可執行的跟進時間（例：明天 10:00–11:00、3 天內）
3. suggestedMessage：可直接貼到 LINE 的完整訊息（禮貌、簡潔、80–200 字）
4. suggestedAction：業務端應做的具體行動（1–3 句）
5. closingStrategy：成交策略（如何推進決策、處理異議）
6. urgencyLevel 只能是 high、medium、low（對應高/中/低優先）
7. ${reEngageHint}

請回傳 JSON（不要 markdown）：
{
  "suggestedFollowUpTime": "",
  "suggestedMessage": "",
  "suggestedAction": "",
  "closingStrategy": "",
  "urgencyLevel": "medium",
  "reEngagement": false
}

---
${context}`;
}

export function parseCustomerAiFollowUp(
  raw: Record<string, unknown> | null,
  customer: Record<string, unknown>,
  engagement: ConversationEngagement,
): CustomerAiFollowUp {
  const urgencyLevel = inferFollowUpUrgency(
    customer,
    engagement,
    normalizeUrgency(raw?.urgencyLevel, "medium"),
  );

  const reEngagement =
    raw?.reEngagement === true ||
    engagement.noRecentReply ||
    String(raw?.reEngagement).toLowerCase() === "true";

  return {
    suggestedFollowUpTime:
      cleanField(raw?.suggestedFollowUpTime ?? raw?.follow_up_time) || NOT_PROVIDED,
    suggestedMessage:
      cleanField(raw?.suggestedMessage ?? raw?.message) ||
      buildReEngagementFallbackMessage(customer),
    suggestedAction:
      cleanField(raw?.suggestedAction ?? raw?.action) ||
      cleanField(customer.next_step) ||
      NOT_PROVIDED,
    closingStrategy:
      cleanField(raw?.closingStrategy ?? raw?.deal_strategy) || NOT_PROVIDED,
    urgencyLevel,
    reEngagement,
    updatedAt: new Date().toISOString(),
  };
}

function buildReEngagementFallbackMessage(customer: Record<string, unknown>): string {
  const name = cleanField(customer.customer_name) || "您好";
  const need = cleanField(customer.customer_need);
  if (need) {
    return `${name} 您好，先前聊到「${need}」，想確認您目前是否還有相關需求？若有任何問題也歡迎直接告訴我，我再為您整理說明。`;
  }
  return `${name} 您好，想關心一下您最近的狀況，若還有想了解的方案或細節，歡迎隨時回覆我。`;
}

export function buildFallbackCustomerAiFollowUp(
  customer: Record<string, unknown>,
  engagement: ConversationEngagement,
): CustomerAiFollowUp {
  const urgencyLevel = inferFollowUpUrgency(customer, engagement);
  const reEngagement = engagement.noRecentReply;

  return {
    suggestedFollowUpTime: reEngagement ? "建議 24–48 小時內主動聯絡" : "依 CRM 追蹤日期執行",
    suggestedMessage: reEngagement
      ? buildReEngagementFallbackMessage(customer)
      : cleanField(customer.follow_up) ||
        cleanField(customer.reply_suggestion) ||
        "您好，想跟您確認目前的進度，若有任何問題歡迎告訴我。",
    suggestedAction:
      cleanField(customer.next_step) ||
      cleanField(customer.todo) ||
      (reEngagement ? "發送喚回訊息並記錄客戶回覆狀態" : "依排程完成下一次跟進"),
    closingStrategy: isHighDealProbability(customer.success_rate)
      ? "聚焦決策時程與報價確認，提供明確下一步與時限。"
      : "先確認需求與痛點，再提供案例或試用降低決策門檻。",
    urgencyLevel,
    reEngagement,
    updatedAt: new Date().toISOString(),
  };
}

export const FOLLOW_UP_URGENCY_THEME: Record<
  FollowUpUrgencyLevel,
  { label: string; accent: string; glow: string; border: string }
> = {
  high: {
    label: "高優先",
    accent: "#fb7185",
    glow: "rgba(251,113,133,0.22)",
    border: "rgba(251,113,133,0.45)",
  },
  medium: {
    label: "中優先",
    accent: "#fbbf24",
    glow: "rgba(251,191,36,0.18)",
    border: "rgba(251,191,36,0.4)",
  },
  low: {
    label: "低優先",
    accent: "#94a3b8",
    glow: "rgba(148,163,184,0.12)",
    border: "rgba(148,163,184,0.28)",
  },
};

export { formatAiSummaryUpdatedAt };
