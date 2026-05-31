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