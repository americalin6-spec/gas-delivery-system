import { isHighDealProbability } from "./followUpReminders";

export type DealPriorityLevel = "high" | "medium" | "low";
export type RiskPriorityLevel = "high" | "normal";

export type CustomerAiSummary = {
  customerNeeds: string;
  painPoints: string;
  dealProbability: string;
  customerEmotion: string;
  suggestedNextStep: string;
  riskAlert: string;
  dealLevel: DealPriorityLevel;
  riskLevel: RiskPriorityLevel;
  updatedAt: string;
};

export type CustomerAiSummaryContext = {
  customer: Record<string, unknown>;
  conversationText: string;
};

const NOT_PROVIDED = "尚無明確資料";

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

export function buildCustomerAiSummaryContext(
  customer: Record<string, unknown>,
  conversationText: string,
): string {
  const lines: string[] = [
    "【CRM 客戶資料】",
    `姓名：${cleanField(customer.customer_name) || "未命名"}`,
    `公司：${cleanField(customer.company_name) || "—"}`,
    `電話：${cleanField(customer.phone) || "—"}`,
    `LINE：${cleanField(customer.line_id) || "—"}`,
    `需求：${cleanField(customer.customer_need) || "—"}`,
    `情緒：${cleanField(customer.customer_emotion) || "—"}`,
    `成交機率：${cleanField(customer.success_rate) || "—"}`,
    `客戶等級：${cleanField(customer.customer_level) || "—"}`,
    `流失風險：${cleanField(customer.churn_risk) || "—"}`,
    `預估金額：${cleanField(customer.estimated_amount) || "—"}`,
    `下一步：${cleanField(customer.next_step) || "—"}`,
    `待辦：${cleanField(customer.todo) || "—"}`,
    `追蹤訊息：${cleanField(customer.follow_up) || "—"}`,
    `備註：${cleanField(customer.note) || "—"}`,
    `最後聯絡：${cleanField(customer.last_contacted_at) || "—"}`,
  ];

  const conv = truncateConversation(conversationText);
  if (conv) {
    lines.push("", "【LINE 對話紀錄】", conv);
  } else {
    lines.push("", "【LINE 對話紀錄】", "（尚無對話內容）");
  }

  return lines.join("\n");
}

export function buildCustomerAiSummaryPrompt(context: string): string {
  return `你是一位 B2B CRM 顧問。請根據以下「CRM 資料 + LINE 對話 + 備註」產出客戶洞察摘要。

規則：
1. 僅使用提供的資料推論，不要捏造未出現的事實
2. 每個欄位 2–4 句繁體中文，條列或短段落，精煉可執行
3. 客戶痛點：從對話與備註中推測阻礙成交或決策的困難（預算、時程、競品、內部決策等）
4. dealLevel 只能是 high、medium、low（對應高/中/低成交意願）
5. riskLevel 只能是 high 或 normal（高風險需明確說明原因，否則 normal）
6. 若資料不足，該欄位寫「尚無明確資料」，勿編造

請回傳 JSON（不要 markdown）：
{
  "customerNeeds": "",
  "painPoints": "",
  "dealProbability": "",
  "customerEmotion": "",
  "suggestedNextStep": "",
  "riskAlert": "",
  "dealLevel": "medium",
  "riskLevel": "normal"
}

---
${context}`;
}

function normalizeLevel(
  raw: unknown,
  allowed: readonly string[],
  fallback: string,
): string {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (allowed.includes(t)) return t;
  if (t === "高" || t === "high") return allowed[0];
  if (t === "中" || t === "medium" || t === "mid") return allowed[1] ?? allowed[0];
  if (t === "低" || t === "low") return allowed[allowed.length - 1];
  return fallback;
}

export function inferDealLevel(
  rate: string | null | undefined,
  aiLevel?: DealPriorityLevel,
): DealPriorityLevel {
  if (aiLevel) return aiLevel;
  const t = String(rate ?? "").trim().toLowerCase();
  if (isHighDealProbability(rate) || t.includes("高")) return "high";
  if (t.includes("中") || t.includes("medium")) return "medium";
  if (t.includes("低") || t.includes("low")) return "low";
  return "medium";
}

export function inferRiskLevel(
  churn: string | null | undefined,
  urgent: boolean | null | undefined,
  aiLevel?: RiskPriorityLevel,
): RiskPriorityLevel {
  if (aiLevel) return aiLevel;
  const c = String(churn ?? "").trim().toLowerCase();
  if (urgent === true) return "high";
  if (c.includes("高") || c === "high" || c.includes("流失")) return "high";
  return "normal";
}

export function parseCustomerAiSummary(
  raw: Record<string, unknown> | null,
  customer: Record<string, unknown>,
): CustomerAiSummary {
  const updatedAt = new Date().toISOString();
  const rate = cleanField(customer.success_rate);
  const churn = cleanField(customer.churn_risk);

  const dealLevel = normalizeLevel(
    raw?.dealLevel,
    ["high", "medium", "low"],
    "medium",
  ) as DealPriorityLevel;

  const riskLevel = normalizeLevel(
    raw?.riskLevel,
    ["high", "normal"],
    "normal",
  ) as RiskPriorityLevel;

  const resolvedDealLevel = inferDealLevel(rate, dealLevel);
  const resolvedRiskLevel = inferRiskLevel(
    churn,
    customer.urgent === true,
    riskLevel,
  );

  return {
    customerNeeds:
      cleanField(raw?.customerNeeds ?? raw?.customer_needs) ||
      cleanField(customer.customer_need) ||
      NOT_PROVIDED,
    painPoints: cleanField(raw?.painPoints ?? raw?.pain_points) || NOT_PROVIDED,
    dealProbability:
      cleanField(raw?.dealProbability ?? raw?.deal_probability) ||
      rate ||
      NOT_PROVIDED,
    customerEmotion:
      cleanField(raw?.customerEmotion ?? raw?.customer_emotion) ||
      cleanField(customer.customer_emotion) ||
      NOT_PROVIDED,
    suggestedNextStep:
      cleanField(raw?.suggestedNextStep ?? raw?.suggested_next_step) ||
      cleanField(customer.next_step) ||
      NOT_PROVIDED,
    riskAlert:
      cleanField(raw?.riskAlert ?? raw?.risk_alert) ||
      (resolvedRiskLevel === "high"
        ? cleanField(churn) || "建議優先確認客戶是否仍有購買意願與決策時程。"
        : "目前未見重大風險訊號，維持定期追蹤即可。"),
    dealLevel: resolvedDealLevel,
    riskLevel: resolvedRiskLevel,
    updatedAt,
  };
}

export function buildFallbackCustomerAiSummary(
  customer: Record<string, unknown>,
): CustomerAiSummary {
  const rate = cleanField(customer.success_rate);
  const churn = cleanField(customer.churn_risk);
  const dealLevel = inferDealLevel(rate);
  const riskLevel = inferRiskLevel(churn, customer.urgent === true);

  return {
    customerNeeds: cleanField(customer.customer_need) || NOT_PROVIDED,
    painPoints: NOT_PROVIDED,
    dealProbability: rate || NOT_PROVIDED,
    customerEmotion: cleanField(customer.customer_emotion) || NOT_PROVIDED,
    suggestedNextStep:
      cleanField(customer.next_step) ||
      cleanField(customer.todo) ||
      NOT_PROVIDED,
    riskAlert:
      riskLevel === "high"
        ? churn || "客戶標記為高風險或緊急，建議盡快聯絡確認。"
        : "目前未見明確高風險，請依追蹤節奏持續維護。",
    dealLevel,
    riskLevel,
    updatedAt: new Date().toISOString(),
  };
}

export const DEAL_PRIORITY_THEME: Record<
  DealPriorityLevel,
  { label: string; accent: string; glow: string; border: string }
> = {
  high: {
    label: "高成交",
    accent: "#34d399",
    glow: "rgba(52,211,153,0.22)",
    border: "rgba(52,211,153,0.45)",
  },
  medium: {
    label: "中成交",
    accent: "#fbbf24",
    glow: "rgba(251,191,36,0.18)",
    border: "rgba(251,191,36,0.4)",
  },
  low: {
    label: "低成交",
    accent: "#94a3b8",
    glow: "rgba(148,163,184,0.12)",
    border: "rgba(148,163,184,0.28)",
  },
};

export const RISK_PRIORITY_THEME: Record<
  RiskPriorityLevel,
  { label: string; accent: string; glow: string; border: string }
> = {
  high: {
    label: "高風險",
    accent: "#f87171",
    glow: "rgba(248,113,113,0.2)",
    border: "rgba(248,113,113,0.45)",
  },
  normal: {
    label: "風險可控",
    accent: "#a5b4fc",
    glow: "rgba(165,180,252,0.12)",
    border: "rgba(165,180,252,0.28)",
  },
};

export function formatAiSummaryUpdatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function hasPersistedAiSummaryContent(
  raw: Partial<CustomerAiSummary> | null | undefined,
): boolean {
  if (!raw) return false;
  return [
    raw.customerNeeds,
    raw.painPoints,
    raw.dealProbability,
    raw.customerEmotion,
    raw.suggestedNextStep,
    raw.riskAlert,
  ].some((v) => cleanField(v).length > 0);
}

/** Hydrate dashboard state from `customers.ai_*` — returns null when row has no saved AI text. */
export function hydrateCustomerAiSummaryFromPersisted(
  raw: Partial<CustomerAiSummary>,
): CustomerAiSummary | null {
  if (!hasPersistedAiSummaryContent(raw)) return null;

  const dealProbability = cleanField(raw.dealProbability);
  const riskAlert = cleanField(raw.riskAlert);

  return {
    customerNeeds: cleanField(raw.customerNeeds) || NOT_PROVIDED,
    painPoints: cleanField(raw.painPoints) || NOT_PROVIDED,
    dealProbability: dealProbability || NOT_PROVIDED,
    customerEmotion: cleanField(raw.customerEmotion) || NOT_PROVIDED,
    suggestedNextStep: cleanField(raw.suggestedNextStep) || NOT_PROVIDED,
    riskAlert: riskAlert || NOT_PROVIDED,
    dealLevel: inferDealLevel(
      dealProbability,
      raw.dealLevel as DealPriorityLevel | undefined,
    ),
    riskLevel: inferRiskLevel(
      riskAlert,
      false,
      raw.riskLevel as RiskPriorityLevel | undefined,
    ),
    updatedAt: String(raw.updatedAt ?? "").trim() || new Date().toISOString(),
  };
}
