import type { AppLang } from "./appLang";
import { diffCalendarDaysYmd, getTaipeiTodayYmd, normalizeFollowUpDateValue } from "./followUpReminders";
import { parseFirstDateYmdFromText } from "./dateParser";

export type CustomerPriority = "high" | "normal" | null;

export type CustomerUrgencyFlags = {
  urgent: boolean;
  priority: CustomerPriority;
};

/** Days from today to important date (0 = today, positive = future). */
export function diffDaysToImportantDate(importantDate: unknown, today: Date = new Date()): number | null {
  const todayYmd = getTaipeiTodayYmd(today);
  let ymd = normalizeFollowUpDateValue(importantDate);
  if (!ymd && importantDate != null) {
    ymd = parseFirstDateYmdFromText(String(importantDate));
  }
  if (!ymd) return null;
  return diffCalendarDaysYmd(todayYmd, ymd);
}

/** Within 0–2 calendar days (today through two days ahead). */
export function isImportantDateWithinTwoDays(importantDate: unknown, today: Date = new Date()): boolean {
  const diff = diffDaysToImportantDate(importantDate, today);
  if (diff === null) return false;
  return diff >= 0 && diff <= 2;
}

export function computeCustomerUrgencyFromImportantDate(
  importantDate: unknown,
  today: Date = new Date(),
): CustomerUrgencyFlags {
  if (!isImportantDateWithinTwoDays(importantDate, today)) {
    return { urgent: false, priority: null };
  }
  return { urgent: true, priority: "high" };
}

export function urgentActionLabel(
  importantDate: unknown,
  lang: AppLang,
): string | null {
  if (!isImportantDateWithinTwoDays(importantDate)) return null;
  const diff = diffDaysToImportantDate(importantDate);
  const zh = lang === "zh";
  if (diff === 0) return zh ? "今天立即處理" : "Handle today";
  return zh ? "緊急案件" : "Urgent";
}
