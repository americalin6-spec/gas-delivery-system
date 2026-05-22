import type { AppLang } from "./appLang";
import {
  resolveDisplayImportantDateFromStored,
} from "./sanitizeImportantDateFields";
import {
  formatFollowUpDateDisplay,
  getVerifiedFollowUpYmd,
  normalizeFollowUpDateValue,
  resolveDisplayFollowUpYmd,
} from "./followUpReminders";

export type ConversationSourceRow = {
  customer_id?: string | number | null;
  message_text?: string | null;
};

/** Merge conversation messages into one source string per customer (chronological). */
export function buildConversationSourceMap(
  rows: ConversationSourceRow[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const id = row.customer_id == null ? "" : String(row.customer_id).trim();
    if (!id) continue;
    const msg = String(row.message_text ?? "").trim();
    if (!msg) continue;
    const prev = map.get(id);
    map.set(id, prev ? `${prev}\n${msg}` : msg);
  }
  return map;
}

/** Important dates for UI — conversation anchors only; hides corrupt DB values. */
export function resolveDisplayImportantDate(
  sourceText: string,
  lang: AppLang,
  referenceDate: Date = new Date(),
  storedImportantDate?: unknown,
): string | null {
  return resolveDisplayImportantDateFromStored(
    storedImportantDate,
    sourceText,
    lang,
    referenceDate,
  );
}

export function resolveVerifiedFollowUpYmd(
  stored: unknown,
  sourceText: string,
  options?: { manualOverrideYmd?: string | null; referenceDate?: Date },
): string | null {
  return resolveDisplayFollowUpYmd(stored, sourceText, options);
}

export function followUpReminderDisplay(
  stored: unknown,
  sourceText: string,
  lang: AppLang,
  noDateLabel: string,
  options?: { manualOverrideYmd?: string | null },
): string {
  const ymd = resolveDisplayFollowUpYmd(stored, sourceText, options);
  if (!ymd) return noDateLabel;
  return `${formatFollowUpDateDisplay(ymd, lang)} (${ymd})`;
}

/** Parse todo field into bullet items (newline or • prefixed). */
export function parseTodoBulletItems(todo: unknown): string[] {
  const raw = String(todo ?? "").trim();
  if (!raw || raw === "-" || raw === "--") return [];

  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: string[] = [];
  for (const line of lines) {
    const bullet = line.match(/^[\s•·\-\*]+(.+)$/u) ?? line.match(/^\d+[\.\)、]\s*(.+)$/u);
    items.push(bullet ? bullet[1].trim() : line);
  }

  if (items.length === 1 && /[•·]/.test(items[0])) {
    return items[0]
      .split(/[•·]/u)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return items;
}

/** Filter helpers: use verified follow-up only (not stale DB fake dates). */
export function verifiedFollowUpYmdForFilter(
  stored: unknown,
  sourceText: string,
): string | null {
  return getVerifiedFollowUpYmd(stored, sourceText);
}

export function hasStoredButUnverifiedFollowUp(
  stored: unknown,
  sourceText: string,
): boolean {
  const normalized = normalizeFollowUpDateValue(stored);
  if (!normalized) return false;
  return getVerifiedFollowUpYmd(stored, sourceText) === null;
}
