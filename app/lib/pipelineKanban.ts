import type { AppLang } from "./appLang";
import { customerStatusLabel, normalizeCustomerStatus } from "./customerStatus";

/** Parse estimated_amount text into a number (TWD-style 萬/万 supported). */
export function parseEstimatedAmountValue(raw: unknown): number {
  const text = String(raw ?? "").trim();
  if (!text || text === "-" || text === "--") return 0;

  const normalized = text.replace(/,/g, "").replace(/\s/g, "");
  const wanMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:萬|万)/u);
  if (wanMatch) return Math.round(Number(wanMatch[1]) * 10000);

  const digits = normalized.replace(/[^\d.]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
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
  if (rate) tags.push(rate);

  if (row.urgent) tags.push("緊急");
  else if (row.priority === "high") tags.push("高優先");

  const level = row.customer_level?.trim();
  if (level) tags.push(level);

  if (tags.length === 0) {
    tags.push(customerStatusLabel(normalizeCustomerStatus(row.customer_status ?? row.status), "zh"));
  }

  return tags.slice(0, 4);
}
