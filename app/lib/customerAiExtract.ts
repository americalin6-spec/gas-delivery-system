import { extractCustomerFromLineChat, isValidExtractedCustomerName } from "./extractCustomerFromLineChat";
import { normalizeLineIdForDisplay } from "./lineIdDisplay";
import {
  CUSTOMER_SOCIAL_FIELD_KEYS,
  type CustomerSocialFieldKey,
} from "./customerSocialMedia";

export const AI_EXTRACT_LABEL_ZH = "AI 自動擷取";

export const AI_EXTRACT_COLUMN_LABELS_ZH: Record<AiExtractCustomerColumn, string> = {
  customer_name: "客戶姓名",
  company_name: "公司",
  phone: "電話",
  email: "電子郵件",
  line_id: "LINE 帳號",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  xiaohongshu: "小紅書",
  youtube: "YouTube",
  website: "官方網站",
  alternate_contact: "備用聯絡方式",
};

/** DB column names written by AI extraction. */
export const AI_EXTRACT_CUSTOMER_COLUMNS = [
  "customer_name",
  "company_name",
  "phone",
  "email",
  "line_id",
  ...CUSTOMER_SOCIAL_FIELD_KEYS,
] as const;

export type AiExtractCustomerColumn = (typeof AI_EXTRACT_CUSTOMER_COLUMNS)[number];

/** Keys in AI JSON response (before mapping to DB columns). */
export const AI_EXTRACT_API_KEYS = [
  "name",
  "company",
  "phone",
  "email",
  "line_id",
  "instagram",
  "facebook",
  "tiktok",
  "xiaohongshu",
  "youtube",
  "website",
  "alternate_contact",
] as const;

export type AiExtractApiKey = (typeof AI_EXTRACT_API_KEYS)[number];

const API_TO_COLUMN: Record<AiExtractApiKey, AiExtractCustomerColumn> = {
  name: "customer_name",
  company: "company_name",
  phone: "phone",
  email: "email",
  line_id: "line_id",
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  xiaohongshu: "xiaohongshu",
  youtube: "youtube",
  website: "website",
  alternate_contact: "alternate_contact",
};

export type ExtractedFieldValue = {
  value: string;
  confidence: number;
};

export type CustomerAiExtractFields = Partial<
  Record<AiExtractCustomerColumn, ExtractedFieldValue>
>;

export const AI_EXTRACT_HIGH_CONFIDENCE = 0.92;

/** Labeled lines in chat (IG:, 小紅書:, etc.) — high confidence when matched. */
export const AI_EXTRACT_LABELED_CONFIDENCE = 0.94;

export type ExtractMergeSkipReason =
  | "no_value"
  | "invalid_value"
  | "unchanged"
  | "existing_low_confidence";

export type ExtractMergeSaveReason = "empty_field" | "high_confidence_overwrite";

export type ExtractFieldDecision =
  | {
      action: "save";
      column: AiExtractCustomerColumn;
      value: string;
      confidence: number;
      reason: ExtractMergeSaveReason;
      previousValue?: string;
    }
  | {
      action: "skip";
      column: AiExtractCustomerColumn;
      value?: string;
      confidence?: number;
      reason: ExtractMergeSkipReason;
      existingValue?: string;
    };

export function isCustomerFieldEmpty(value: unknown): boolean {
  const t = String(value ?? "").trim();
  return !t || t === "-" || t === "—" || t === "--";
}

const SOCIAL_INLINE_LABEL_STRIP: Partial<Record<CustomerSocialFieldKey, RegExp>> = {
  instagram: /^(?:@+|(?:instagram|insta|ig))\s*[：:]\s*/iu,
  facebook: /^(?:(?:facebook|fb))\s*[：:]\s*/iu,
  tiktok: /^(?:(?:tiktok|抖音|dy))\s*[：:]\s*/iu,
  xiaohongshu: /^(?:(?:小紅書|小红书|xhs|red))\s*[：:]\s*/iu,
  youtube: /^(?:(?:youtube|yt))\s*[：:]\s*/iu,
  website: /^(?:(?:官方網站|官網|website|網站|site))\s*[：:]\s*/iu,
  alternate_contact: /^(?:(?:備用聯絡方式|备用联系方式|備用聯絡|备用联系))\s*[：:]\s*/iu,
};

function stripTrailingJunk(value: string): string {
  return value.replace(/[，,;；\s]+$/u, "").trim();
}

function cleanExtractedValue(column: AiExtractCustomerColumn, raw: string): string {
  let v = String(raw ?? "").trim();
  if (!v || v === "未提供" || v === "未知") return "";
  if (CUSTOMER_SOCIAL_FIELD_KEYS.includes(column as CustomerSocialFieldKey)) {
    const strip = SOCIAL_INLINE_LABEL_STRIP[column as CustomerSocialFieldKey];
    if (strip) v = v.replace(strip, "").trim();
    v = v.replace(/^@+/, "").trim();
  }
  if (column === "line_id") v = normalizeLineIdForDisplay(v);
  if (column === "customer_name" && !isValidExtractedCustomerName(v)) return "";
  if (column === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "";
  v = stripTrailingJunk(v);
  if (v.length > 500) v = v.slice(0, 500);
  return v;
}

function parseConfidence(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.7;
  return Math.max(0, Math.min(1, n));
}

function fieldFromAiNode(node: unknown): ExtractedFieldValue | null {
  if (node == null) return null;
  if (typeof node === "string" || typeof node === "number") {
    const value = String(node).trim();
    if (!value) return null;
    return { value, confidence: 0.75 };
  }
  if (typeof node === "object" && !Array.isArray(node)) {
    const o = node as Record<string, unknown>;
    const value = String(o.value ?? o.val ?? "").trim();
    if (!value) return null;
    return { value, confidence: parseConfidence(o.confidence ?? o.score) };
  }
  return null;
}

export function mapAiExtractJsonToFields(
  parsed: Record<string, unknown> | null,
): CustomerAiExtractFields {
  if (!parsed) return {};
  const fieldsNode =
    parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
      ? (parsed.fields as Record<string, unknown>)
      : parsed;

  const out: CustomerAiExtractFields = {};
  for (const apiKey of AI_EXTRACT_API_KEYS) {
    const column = API_TO_COLUMN[apiKey];
    const node = fieldsNode[apiKey] ?? fieldsNode[column];
    const field = fieldFromAiNode(node);
    if (!field) continue;
    const cleaned = cleanExtractedValue(column, field.value);
    if (!cleaned) continue;
    out[column] = { value: cleaned, confidence: field.confidence };
  }
  return out;
}

type LabeledRule = {
  column: CustomerSocialFieldKey;
  re: RegExp;
};

const LABELED_SOCIAL_RULES: LabeledRule[] = [
  {
    column: "instagram",
    re: /(?:^|[\n；;])\s*(?:Instagram|IG|Insta|instagram|ig)\s*[：:]\s*([^\n；;]+)/giu,
  },
  {
    column: "facebook",
    re: /(?:^|[\n；;])\s*(?:Facebook|FB|facebook|fb)\s*[：:]\s*([^\n；;]+)/giu,
  },
  {
    column: "tiktok",
    re: /(?:^|[\n；;])\s*(?:TikTok|tiktok|抖音|DY|dy)\s*[：:]\s*([^\n；;]+)/giu,
  },
  {
    column: "xiaohongshu",
    re: /(?:^|[\n；;])\s*(?:小紅書|小红书|XHS|xhs|小紅书)\s*[：:]\s*([^\n；;]+)/giu,
  },
  {
    column: "youtube",
    re: /(?:^|[\n；;])\s*(?:YouTube|Youtube|YT|youtube|yt)\s*[：:]\s*([^\n；;]+)/giu,
  },
  {
    column: "website",
    re: /(?:^|[\n；;])\s*(?:官方網站|官網|Website|website|網站|网站)\s*[：:]\s*([^\n；;]+)/giu,
  },
  {
    column: "alternate_contact",
    re: /(?:^|[\n；;])\s*(?:備用聯絡方式|备用联系方式|備用聯絡|备用联系)\s*[：:]\s*([^\n；;]+)/giu,
  },
];

function labeledSocialFromText(text: string): CustomerAiExtractFields {
  const out: CustomerAiExtractFields = {};
  for (const { column, re } of LABELED_SOCIAL_RULES) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m?.[1]) continue;
    const cleaned = cleanExtractedValue(column, m[1]);
    if (!cleaned) continue;
    const prev = out[column];
    if (!prev || AI_EXTRACT_LABELED_CONFIDENCE >= (prev.confidence ?? 0)) {
      out[column] = { value: cleaned, confidence: AI_EXTRACT_LABELED_CONFIDENCE };
    }
  }
  return out;
}

function regexSocialFromText(text: string): CustomerAiExtractFields {
  const out: CustomerAiExtractFields = {};
  const patterns: { column: CustomerSocialFieldKey; re: RegExp }[] = [
    {
      column: "instagram",
      re: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9._]+/i,
    },
    {
      column: "facebook",
      re: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[A-Za-z0-9.]+/i,
    },
    {
      column: "tiktok",
      re: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@?[A-Za-z0-9._]+/i,
    },
    {
      column: "xiaohongshu",
      re: /(?:https?:\/\/)?(?:www\.)?xiaohongshu\.com\/[^\s，,；;]+/i,
    },
    {
      column: "youtube",
      re: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/[^\s，,；;]+|youtu\.be\/[^\s，,；;]+)/i,
    },
    {
      column: "website",
      re: /(?:https?:\/\/|www\.)[^\s，,；;]+/i,
    },
  ];

  for (const { column, re } of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let value = m[0];
    if (column === "website") {
      const lower = value.toLowerCase();
      if (
        lower.includes("instagram.com") ||
        lower.includes("facebook.com") ||
        lower.includes("tiktok.com") ||
        lower.includes("xiaohongshu.com") ||
        lower.includes("youtube.com") ||
        lower.includes("youtu.be")
      ) {
        continue;
      }
    }
    const cleaned = cleanExtractedValue(column, value);
    if (cleaned) out[column] = { value: cleaned, confidence: 0.88 };
  }
  return out;
}

export function pickSocialFieldsFromExtract(
  fields: CustomerAiExtractFields,
): Partial<Record<CustomerSocialFieldKey, string>> {
  const out: Partial<Record<CustomerSocialFieldKey, string>> = {};
  for (const key of CUSTOMER_SOCIAL_FIELD_KEYS) {
    const v = fields[key]?.value;
    if (v) out[key] = v;
  }
  return out;
}

export function baselineExtractFromConversation(
  conversationText: string,
): CustomerAiExtractFields {
  const out: CustomerAiExtractFields = {};
  const regex = extractCustomerFromLineChat(conversationText, "zh");

  const map: { column: AiExtractCustomerColumn; value: string; conf: number }[] = [
    { column: "customer_name", value: regex.customer_name, conf: 0.86 },
    { column: "company_name", value: regex.company_name, conf: 0.84 },
    { column: "phone", value: regex.phone, conf: 0.9 },
    { column: "email", value: regex.email, conf: 0.9 },
    { column: "line_id", value: regex.line_id, conf: 0.88 },
  ];

  for (const { column, value, conf } of map) {
    const cleaned = cleanExtractedValue(column, value);
    if (cleaned) out[column] = { value: cleaned, confidence: conf };
  }

  const labeled = labeledSocialFromText(conversationText);
  const urlSocial = regexSocialFromText(conversationText);
  for (const source of [labeled, urlSocial]) {
    for (const [col, field] of Object.entries(source) as [
      AiExtractCustomerColumn,
      ExtractedFieldValue,
    ][]) {
      if (!field?.value) continue;
      if (!out[col] || field.confidence > (out[col]?.confidence ?? 0)) {
        out[col] = field;
      }
    }
  }

  return out;
}

export function mergeExtractedFields(
  existing: Record<string, unknown>,
  extracted: CustomerAiExtractFields,
): {
  patch: Record<string, string>;
  updatedColumns: AiExtractCustomerColumn[];
  decisions: ExtractFieldDecision[];
} {
  const patch: Record<string, string> = {};
  const updatedColumns: AiExtractCustomerColumn[] = [];
  const decisions: ExtractFieldDecision[] = [];

  for (const column of AI_EXTRACT_CUSTOMER_COLUMNS) {
    const field = extracted[column];
    if (!field?.value) {
      decisions.push({ action: "skip", column, reason: "no_value" });
      continue;
    }

    const cleaned = cleanExtractedValue(column, field.value);
    if (!cleaned) {
      decisions.push({
        action: "skip",
        column,
        value: field.value,
        confidence: field.confidence,
        reason: "invalid_value",
      });
      continue;
    }

    const current = existing[column];
    const currentStr = isCustomerFieldEmpty(current) ? "" : String(current).trim();
    const empty = isCustomerFieldEmpty(current);
    const high = field.confidence >= AI_EXTRACT_HIGH_CONFIDENCE;

    if (!empty && currentStr === cleaned) {
      decisions.push({
        action: "skip",
        column,
        value: cleaned,
        confidence: field.confidence,
        reason: "unchanged",
        existingValue: currentStr,
      });
      continue;
    }

    if (empty || high) {
      patch[column] = cleaned;
      updatedColumns.push(column);
      decisions.push({
        action: "save",
        column,
        value: cleaned,
        confidence: field.confidence,
        reason: empty ? "empty_field" : "high_confidence_overwrite",
        previousValue: currentStr || undefined,
      });
      continue;
    }

    decisions.push({
      action: "skip",
      column,
      value: cleaned,
      confidence: field.confidence,
      reason: "existing_low_confidence",
      existingValue: currentStr,
    });
  }

  return { patch, updatedColumns, decisions };
}

export function buildCustomerAiExtractPrompt(conversationText: string): string {
  return `你是 CRM 資料擷取助手。請從以下 LINE／貼上對話中擷取客戶聯絡資訊。

規則：
1. 僅擷取對話中明確出現的資訊，勿猜測
2. 每個欄位回傳 { "value": "字串", "confidence": 0.0-1.0 }
3. 找不到的欄位可省略
4. name=客戶姓名, company=公司, line_id=LINE 帳號
5. 社群欄位可為帳號或完整網址；支援標籤如 Instagram/IG/Facebook/TikTok/小紅書/YouTube/官方網站/Website/備用聯絡方式
6. confidence 0.95+ 僅用於對話中非常明確的資訊

回傳 JSON（不要 markdown）：
{
  "fields": {
    "name": { "value": "", "confidence": 0 },
    "company": { "value": "", "confidence": 0 },
    "phone": { "value": "", "confidence": 0 },
    "email": { "value": "", "confidence": 0 },
    "line_id": { "value": "", "confidence": 0 },
    "instagram": { "value": "", "confidence": 0 },
    "facebook": { "value": "", "confidence": 0 },
    "tiktok": { "value": "", "confidence": 0 },
    "xiaohongshu": { "value": "", "confidence": 0 },
    "youtube": { "value": "", "confidence": 0 },
    "website": { "value": "", "confidence": 0 },
    "alternate_contact": { "value": "", "confidence": 0 }
  }
}

---
${conversationText.slice(0, 14000)}`;
}

export function mergeFieldMaps(
  base: CustomerAiExtractFields,
  overlay: CustomerAiExtractFields,
): CustomerAiExtractFields {
  const out = { ...base };
  for (const [col, field] of Object.entries(overlay) as [
    AiExtractCustomerColumn,
    ExtractedFieldValue,
  ][]) {
    if (!field?.value) continue;
    const prev = out[col];
    if (!prev || field.confidence >= prev.confidence) {
      out[col] = field;
    }
  }
  return out;
}

export function formatAiExtractedAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/** Social columns included in {@link AI_EXTRACT_CUSTOMER_COLUMNS} — re-exported for API/server imports. */
export {
  CUSTOMER_SOCIAL_FIELD_KEYS,
  type CustomerSocialFieldKey,
} from "./customerSocialMedia";

/** Subset of {@link AI_EXTRACT_CUSTOMER_COLUMNS} that are social / web contact fields. */
export const AI_EXTRACT_SOCIAL_COLUMNS = CUSTOMER_SOCIAL_FIELD_KEYS;
