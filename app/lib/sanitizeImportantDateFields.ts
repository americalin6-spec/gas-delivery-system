import type { AppLang } from "./appLang";
import {
  explicitDatePhraseFoundInSource,
  extractExplicitImportantDatesList,
  parseExplicitFollowUpDateYmdFromChat,
} from "./dateParser";

export type SanitizedImportantDateFields = {
  important_date: string;
  important_dates: string[];
  follow_up_date: string | null;
  hasExplicitImportantDate: boolean;
};

/** DB insert/update shape for CRM date columns (null = clear). */
export type CrmSanitizedDatePayload = {
  important_date: string | null;
  important_dates: string[];
  follow_up_date: string | null;
};

const MALFORMED_STORED_IMPORTANT_RE =
  /重要日期|^\d{1,2}\/\d{1,2}\s*\([\u4e00-\u9fff]\)|\d{1,2}\/\d{1,2}\(/u;

/** Reject stored date labels not literally present in the conversation (e.g. AI-inferred 2/27). */
function filterDateLabelsVerifiedInSource(labels: string[], sourceText: string): string[] {
  const source = sourceText.trim();
  if (!source) return [];
  return labels.filter((label) => {
    const t = label.trim();
    if (!t) return false;
    if (explicitDatePhraseFoundInSource(t, source)) return true;
    const slash = t.match(/(\d{1,2})\/(\d{1,2})/);
    if (slash) {
      const m = Number(slash[1]);
      const d = Number(slash[2]);
      const variants = [
        `${m}/${d}`,
        `${m}月${d}日`,
        `${m}月${d}号`,
        `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`,
      ];
      return variants.some((v) => explicitDatePhraseFoundInSource(v, source));
    }
    return false;
  });
}

/**
 * Central guard: only dates literally written in originalText may appear on analysis/CRM fields.
 */
export function sanitizeImportantDateFields<T extends Record<string, unknown>>(
  analysis: T,
  originalText: string,
  lang: AppLang = "zh",
  referenceDate: Date = new Date(),
): T & SanitizedImportantDateFields {
  const raw = originalText.trim();
  const important_dates = raw
    ? filterDateLabelsVerifiedInSource(
        extractExplicitImportantDatesList(raw, referenceDate, lang),
        raw,
      )
    : [];
  const important_date =
    important_dates.length > 0 ? important_dates.join(lang === "zh" ? "、" : ", ") : "";
  let follow_up_date = raw ? parseExplicitFollowUpDateYmdFromChat(raw, referenceDate) : null;

  if (!important_date && (!important_dates || important_dates.length === 0)) {
    follow_up_date = null;
  }

  const result = {
    ...analysis,
    important_date,
    important_dates,
    follow_up_date,
    importantDate: important_date,
    importantDates: important_dates,
    followUpDate: follow_up_date,
    hasExplicitImportantDate: important_dates.length > 0,
  } as T & SanitizedImportantDateFields;

  console.log("SANITIZED_IMPORTANT_DATE", {
    important_date: result.important_date,
    important_dates: result.important_dates,
    follow_up_date: result.follow_up_date,
  });

  return result;
}

/** Dates allowed on customers row — derived only from original LINE conversation text. */
export function buildSanitizedCrmDatePayload(
  originalText: string,
  lang: AppLang = "zh",
  referenceDate: Date = new Date(),
): CrmSanitizedDatePayload {
  const sanitized = sanitizeImportantDateFields({}, originalText, lang, referenceDate);
  const payload: CrmSanitizedDatePayload = {
    important_date: sanitized.important_date || null,
    important_dates: sanitized.important_dates,
    follow_up_date: sanitized.follow_up_date,
  };

  console.log("CRM_SAVE_SANITIZED_DATES", {
    important_date: payload.important_date,
    important_dates: payload.important_dates,
    follow_up_date: payload.follow_up_date,
  });

  return payload;
}

/** Overwrite date fields on any CRM insert/update payload before Supabase write. */
export function applySanitizedCrmDateFieldsToPayload(
  row: Record<string, unknown>,
  originalText: string,
  lang: AppLang = "zh",
): Record<string, unknown> {
  const dates = buildSanitizedCrmDatePayload(originalText, lang);
  return {
    ...row,
    important_date: dates.important_date,
    follow_up_date: dates.follow_up_date,
  };
}

/** True for legacy inferred values like「重要日期 2/27(五)」stored without a literal anchor. */
export function isMalformedStoredImportantDate(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || raw === "--") return false;
  return MALFORMED_STORED_IMPORTANT_RE.test(raw);
}

/** UI: never show stored important_date unless conversation contains the same literal anchor. */
export function resolveDisplayImportantDateFromStored(
  stored: unknown,
  sourceText: string,
  lang: AppLang = "zh",
  referenceDate: Date = new Date(),
): string | null {
  const fromConversation = sourceText.trim()
    ? filterDateLabelsVerifiedInSource(
        extractExplicitImportantDatesList(sourceText, referenceDate, lang),
        sourceText,
      )
    : [];
  if (fromConversation.length > 0) {
    return fromConversation.join(lang === "zh" ? "、" : ", ");
  }

  const storedRaw = String(stored ?? "").trim();
  if (!storedRaw || isMalformedStoredImportantDate(storedRaw)) return null;

  return null;
}
