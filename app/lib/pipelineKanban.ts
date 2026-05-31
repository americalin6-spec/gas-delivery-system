import type { AppLang } from "./appLang";
import { localizeCrmDisplayText } from "./crmAiDisplayLabels";
import { customerStatusLabel, normalizeCustomerStatus } from "./customerStatus";

const WAN_BUDGET_RANGE_PATTERNS = [
  /預算\s*(?:大概|約)?\s*(\d+(?:\.\d+)?)\s*萬\s*(?:到|至|~|～|—|-)\s*(\d+(?:\.\d+)?)\s*萬/u,
  /預算\s*(?:大概|約)?\s*(\d+(?:\.\d+)?)\s*(?:到|至|~|～|—|-)\s*(\d+(?:\.\d+)?)\s*萬/u,
  /(\d+(?:\.\d+)?)\s*萬\s*(?:到|至|~|～|—|-)\s*(\d+(?:\.\d+)?)\s*萬/u,
  /(\d+(?:\.\d+)?)\s*(?:到|至|~|～|—|-)\s*(\d+(?:\.\d+)?)\s*萬/u,
] as const;

function trimAmountDecimal(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function formatSingleAmountNumber(n: number, lang: AppLang): string {
  if (n <= 0) return "";
  if (lang === "zh") {
    if (n >= 100_000_000) {
      return `${trimAmountDecimal(n / 100_000_000)}億`;
    }
    if (n >= 10_000) {
      return `${trimAmountDecimal(n / 10_000)}萬`;
    }
    return n.toLocaleString("zh-TW");
  }
  if (n >= 1_000_000) {
    return `NT$ ${trimAmountDecimal(n / 1_000_000)}M`;
  }
  return `NT$ ${n.toLocaleString("en-US")}`;
}

/** Extract budget range from chat/labeled text → stored as `{low}~{high}` (TWD integers). */
export function extractEstimatedAmountRangeStorage(text: string): string {
  const t = text.trim().replace(/,/g, "");
  if (!t) return "";

  for (const re of WAN_BUDGET_RANGE_PATTERNS) {
    const m = t.match(re);
    if (!m?.[1] || !m?.[2]) continue;
    const lowWan = Number(m[1]);
    const highWan = Number(m[2]);
    if (!Number.isFinite(lowWan) || !Number.isFinite(highWan) || lowWan <= 0 || highWan <= 0) {
      continue;
    }
    const low = Math.round(Math.min(lowWan, highWan) * 10_000);
    const high = Math.round(Math.max(lowWan, highWan) * 10_000);
    return `${low}~${high}`;
  }

  return "";
}

/** Parse stored or labeled budget range text. */
export function tryParseEstimatedAmountRange(raw: unknown): { low: number; high: number } | null {
  const text = String(raw ?? "").trim().replace(/,/g, "");
  if (!text) return null;

  const stored = text.replace(/\s/g, "").match(/^(\d+(?:\.\d+)?)[~～](\d+(?:\.\d+)?)$/);
  if (stored) {
    const low = Number(stored[1]);
    const high = Number(stored[2]);
    if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0) {
      return { low: Math.min(low, high), high: Math.max(low, high) };
    }
  }

  for (const re of WAN_BUDGET_RANGE_PATTERNS) {
    const m = text.match(re);
    if (!m?.[1] || !m?.[2]) continue;
    const lowWan = Number(m[1]);
    const highWan = Number(m[2]);
    if (!Number.isFinite(lowWan) || !Number.isFinite(highWan) || lowWan <= 0 || highWan <= 0) {
      continue;
    }
    return {
      low: Math.round(Math.min(lowWan, highWan) * 10_000),
      high: Math.round(Math.max(lowWan, highWan) * 10_000),
    };
  }

  return null;
}

/** Parse estimated_amount text into a number (TWD-style 萬/万 supported). */
export function parseEstimatedAmountValue(raw: unknown): number {
  const text = String(raw ?? "").trim();
  if (!text || text === "-" || text === "--") return 0;

  const range = tryParseEstimatedAmountRange(text);
  if (range) return range.high;

  const normalized = text.replace(/,/g, "").replace(/\s/g, "");
  const wanMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:萬|万)/u);
  if (wanMatch) return Math.round(Number(wanMatch[1]) * 10000);

  const yiMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:億|亿)/u);
  if (yiMatch) return Math.round(Number(yiMatch[1]) * 100000000);

  const digits = normalized.replace(/[^\d.]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

/** UI-only: format stored estimated_amount (e.g. 30000000 → 3000萬). */
export function formatEstimatedAmountDisplay(raw: unknown, lang: AppLang = "zh"): string {
  const text = String(raw ?? "").trim();
  if (!text || text === "-" || text === "--") return "—";

  const lower = text.toLowerCase();
  if (
    text === "未提供" ||
    text === "未偵測" ||
    lower === "not provided" ||
    lower === "not detected" ||
    lower === "n/a"
  ) {
    return text;
  }

  const range = tryParseEstimatedAmountRange(text);
  if (range) {
    if (lang === "zh") {
      return `${formatSingleAmountNumber(range.low, lang)}～${formatSingleAmountNumber(range.high, lang)}`;
    }
    return `${formatSingleAmountNumber(range.low, lang)} – ${formatSingleAmountNumber(range.high, lang)}`;
  }

  const n = parseEstimatedAmountValue(text);
  if (n <= 0) return text;

  return formatSingleAmountNumber(n, lang);
}

export function formatColumnAmountTotal(total: number, lang: AppLang): string {
  if (total <= 0) return lang === "zh" ? "—" : "—";
  if (lang === "zh" && total >= 10000) {
    const wan = total / 10000;
    const label = Number.isInteger(wan) ? String(wan) : wan.toFixed(1);
    return `NT$ ${label} 萬`;
  }
  return `NT$ ${total.toLocaleString(lang === "zh" ? "zh-TW" : "en-US")}`;
}

export function buildPipelineCardTags(row: {
  success_rate?: string | null;
  priority?: string | null;
  urgent?: boolean | null;
  customer_level?: string | null;
  customer_status?: unknown;
  status?: unknown;
}): string[] {
  const tags: string[] = [];
  const rate = row.success_rate?.trim();
  if (rate) tags.push(localizeCrmDisplayText(rate));

  if (row.urgent) tags.push("緊急");
  else if (row.priority === "high") tags.push("高優先");

  const level = row.customer_level?.trim();
  if (level) tags.push(localizeCrmDisplayText(level));

  if (tags.length === 0) {
    tags.push(customerStatusLabel(normalizeCustomerStatus(row.customer_status ?? row.status), "zh"));
  }

  return tags.slice(0, 4);
}
