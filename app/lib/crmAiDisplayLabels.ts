/**
 * CRM UI display labels for AI tiers and probability tokens.
 * Display-only — does not change stored DB values or AI inference logic.
 */

export type CrmTierToken = "high" | "medium" | "low";
export type CrmRiskToken = "high" | "normal";

/** Exact token → 中文 (lowercase keys). */
const TIER_TOKEN_ZH: Record<string, string> = {
  high: "高",
  medium: "中",
  mid: "中",
  low: "低",
  normal: "一般",
};

/** Common English phrases → 中文. */
const PHRASE_ZH: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
  normal: "一般",
  "a-level client": "A級客戶",
  "b-level client": "B級客戶",
  "c-level client": "C級客戶",
  "high probability": "高",
  "medium probability": "中",
  "low probability": "低",
  "high risk": "高風險",
  "medium risk": "中風險",
  "low risk": "低風險",
  "not provided": "未提供",
  "not detected": "未偵測",
  unknown: "未知",
};

const WORD_BOUNDARY_TIER: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\bhigh\b/gi, replacement: "高" },
  { pattern: /\bmedium\b/gi, replacement: "中" },
  { pattern: /\bmid\b/gi, replacement: "中" },
  { pattern: /\blow\b/gi, replacement: "低" },
  { pattern: /\bnormal\b/gi, replacement: "一般" },
];

/** Map internal tier keys to short 中文 labels (badges / tags). */
export function tierTokenLabelZh(token: string | null | undefined): string {
  if (token == null) return "";
  const key = String(token).trim().toLowerCase();
  return TIER_TOKEN_ZH[key] ?? String(token).trim();
}

export function dealProbabilityLabelZh(value: string | null | undefined): string {
  return localizeCrmDisplayText(value);
}

export function riskLevelLabelZh(value: string | null | undefined): string {
  return localizeCrmDisplayText(value);
}

export function customerLevelLabelZh(value: string | null | undefined): string {
  return localizeCrmDisplayText(value);
}

export function urgencyLevelLabelZh(value: string | null | undefined): string {
  return localizeCrmDisplayText(value);
}

/**
 * Normalize any CRM / AI field for on-screen display (中文 only for tier tokens).
 */
export function localizeCrmDisplayText(value: string | null | undefined): string {
  if (value == null) return "—";
  const raw = String(value).trim();
  if (!raw || raw === "--" || raw === "-") return raw || "—";

  const lower = raw.toLowerCase();
  if (PHRASE_ZH[lower]) return PHRASE_ZH[lower];
  if (TIER_TOKEN_ZH[lower]) return TIER_TOKEN_ZH[lower];

  if (/^(高|中|低|一般)$/.test(raw)) return raw;

  let out = raw;
  for (const { pattern, replacement } of WORD_BOUNDARY_TIER) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
