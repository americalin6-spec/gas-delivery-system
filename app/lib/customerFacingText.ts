/** Conservative helpers to keep internal product tokens out of customer-facing text. */

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function isBlockedExtractedCompanyName(value: string | null | undefined): boolean {
  const text = normalizeText(value).toLowerCase();

  if (!text) return true;

  return [
    "line work ai",
    "業務",
    "客服",
    "顧問",
    "先生",
    "小姐",
    "客戶",
    "您好",
  ].includes(text);
}

export function isBlockedExtractedContactValue(value: string | null | undefined): boolean {
  const text = normalizeText(value).toLowerCase();

  if (!text) return true;

  return ["無", "未提供", "不提供", "不知道", "na", "n/a", "-"].includes(text);
}

export function isBlockedExtractedLineId(value: string | null | undefined): boolean {
  const text = normalizeText(value).toLowerCase();

  if (!text) return true;

  return ["無", "未提供", "不知道", "line", "line id"].includes(text);
}

export function isLikelyInternalIntroMessage(value: string | null | undefined): boolean {
  const text = normalizeText(value);

  if (!text) return false;

  return /LINE Work AI|我是.*(顧問|業務|客服)|很高興認識您/.test(text);
}

const INTERNAL_TOKEN_PATTERNS: RegExp[] = [
  /line\s*work\s*ai/giu,
  /line\s*work/giu,
  /\ba-?\s*nex\b/giu,
  /\bgrouptools\b/giu,
  /\bmy\s*grouptools\b/giu,
  /\bCRM\b/g,
  /客戶關係管理(?:系統|平台)?/gu,
  /客户关系管理(?:系统|平台)?/gu,
];

function stripInternalTokens(text: string): string {
  let out = text;
  for (const pattern of INTERNAL_TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, "");
  }
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/，{2,}/g, "，")
    .replace(/,{2,}/g, ",")
    .trim();
}

/** Remove internal product/system tokens from general customer-facing copy. */
export function sanitizeCustomerFacingText(text: string | null | undefined): string {
  const raw = normalizeText(text);
  if (!raw) return "";
  return stripInternalTokens(raw);
}

/** Same sanitization for outbound LINE reply drafts. */
export function sanitizeCustomerFacingLineReply(text: string | null | undefined): string {
  return sanitizeCustomerFacingText(text);
}
