import { resolveCustomerHonorific } from "./customerHonorific";
import { explicitFollowUpYmdsFromSource } from "./dateParser";

/** Deal probability considered "high" for auto follow-up scheduling */
export function isHighDealProbability(rate?: unknown): boolean {
  if (rate == null) return false;
  const t = String(rate).trim().toLowerCase();
  if (!t) return false;
  return (
    t === "高" ||
    t === "high" ||
    t === "90%" ||
    t.includes("高") ||
    /^high\b/i.test(String(rate).trim())
  );
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar date YYYY-MM-DD (avoid UTC shift for DATE columns) */
export function formatLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Calendar YYYY-MM-DD for `d` interpreted in `timeZone` (e.g. Asia/Taipei). */
export function formatYmdInTimeZone(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return formatLocalYmd(d);
  }
}

/** Today's calendar date in Asia/Taipei (for CRM follow-up vs server TZ). */
export function getTaipeiTodayYmd(now: Date = new Date()): string {
  return formatYmdInTimeZone(now, "Asia/Taipei");
}

/** Map a DB timestamptz / ISO string to its calendar date in Asia/Taipei. */
export function timestampToTaipeiYmd(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(d.getTime())) return null;
  return formatYmdInTimeZone(d, "Asia/Taipei");
}

/** Signed day difference between two YYYY-MM-DD strings (pure calendar, UTC-safe). */
export function diffCalendarDaysYmd(fromYmd: string, toYmd: string): number | null {
  const ma = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromYmd);
  const mb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toYmd);
  if (!ma || !mb) return null;
  const ta = Date.UTC(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]));
  const tb = Date.UTC(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]));
  return Math.round((tb - ta) / 86400000);
}

/** @deprecated Auto follow-up scheduling disabled; retained for legacy imports only. */
export function computeHighPotentialFollowUpDate(): string {
  const offsetDays = 1 + Math.floor(Math.random() * 3);
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return formatLocalYmd(d);
}

/** Show stored follow-up only when it matches an explicit date anchor in source conversation. */
export function getVerifiedFollowUpYmd(
  stored: unknown,
  sourceText: string,
  referenceDate: Date = new Date(),
): string | null {
  const normalized = normalizeFollowUpDateValue(stored);
  if (!normalized) return null;
  const allowed = explicitFollowUpYmdsFromSource(sourceText, referenceDate);
  if (allowed.length === 0) return null;
  return allowed.includes(normalized) ? normalized : null;
}

/**
 * UI display: verified conversation date, or a user-confirmed CRM date (manualOverrideYmd).
 */
export function resolveDisplayFollowUpYmd(
  stored: unknown,
  sourceText: string,
  options?: { manualOverrideYmd?: string | null; referenceDate?: Date },
): string | null {
  const ref = options?.referenceDate ?? new Date();
  const manual = normalizeFollowUpDateValue(options?.manualOverrideYmd);
  const normalized = normalizeFollowUpDateValue(stored);
  if (!normalized) return null;
  if (manual && manual === normalized) return normalized;
  return getVerifiedFollowUpYmd(stored, sourceText, ref);
}

/** Coerce DB/API values (string, Date, ISO timestamp) to calendar YYYY-MM-DD or null */
export function normalizeFollowUpDateValue(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatLocalYmd(value);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const head = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (!head) return null;
  return parseLocalYmd(head[1]) ? head[1] : null;
}

export function parseLocalYmd(input: unknown): Date | null {
  if (input == null) return null;
  let s: string;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    s = formatLocalYmd(input);
  } else {
    s = String(input).trim();
  }
  const head = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (!head) return null;
  const ymd = head[1];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(y, mo, day);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null;
  return d;
}

export type FollowUpBadge = "none" | "overdue" | "soon" | "upcoming";

export function getFollowUpBadge(followUpDate?: unknown): FollowUpBadge {
  const ymd = normalizeFollowUpDateValue(followUpDate);
  if (!ymd) return "none";
  const target = parseLocalYmd(ymd);
  if (!target) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (86400 * 1000));
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "soon";
  return "upcoming";
}

export type SuggestionCustomer = {
  customer_name?: string | null;
  company_name?: string | null;
  customer_need?: string | null;
  next_step?: string | null;
  follow_up?: string | null;
  raw_text?: string | null;
};

function formatNeedRecapZh(need: string): string {
  const chips = need
    .split(/[、,，]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (chips.length === 0) return need;
  if (chips.length === 1) return chips[0];
  if (chips.length === 2) return `${chips[0]}以及${chips[1]}`;
  return `${chips.slice(0, -1).join("、")}，以及${chips[chips.length - 1]}`;
}

function formatNeedRecapEn(need: string): string {
  const chips = need
    .split(/[,、]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (chips.length === 0) return need;
  if (chips.length === 1) return chips[0];
  if (chips.length === 2) return `${chips[0]} and ${chips[1]}`;
  return `${chips.slice(0, -1).join(", ")}, and ${chips[chips.length - 1]}`;
}

/** Template for salesperson — not sent automatically */
export function buildSuggestedSalesFollowUp(c: SuggestionCustomer, lang: "zh" | "en"): string {
  const need = c.customer_need?.trim();
  const { greetingZh, greetingEn } = resolveCustomerHonorific({
    customerName: c.customer_name,
    rawText: c.raw_text,
    lang,
  });

  if (lang === "zh") {
    const needPart = need
      ? `先前聊到${formatNeedRecapZh(need)}，想跟您同步一下目前進度。`
      : "想跟您同步一下目前進度。";
    return `${greetingZh}，${needPart}如果方便的話，我們也可以先提供初步提案與報價給您參考。期待您的回覆，謝謝！`;
  }

  const needPart = need
    ? `Following up on ${formatNeedRecapEn(need)} — wanted to share a quick progress update.`
    : "Wanted to share a quick progress update.";
  return `${greetingEn}, ${needPart} If it works for you, we can also share a preliminary proposal and quotation. Looking forward to hearing from you. Thank you!`;
}

export function formatFollowUpDateDisplay(ymd: unknown, locale: "zh" | "en"): string {
  const normalized = normalizeFollowUpDateValue(ymd);
  if (!normalized) return "";
  const d = parseLocalYmd(normalized);
  if (!d) return normalized;
  try {
    return d.toLocaleDateString(locale === "zh" ? "zh-TW" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return normalized;
  }
}
