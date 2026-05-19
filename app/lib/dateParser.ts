/**
 * Natural-language date parsing + intent classification for LINE chat (important_date).
 * Uses local calendar dates (native Date; no external deps).
 */

export type DateIntentType =
  | "shooting_date"
  | "quote_deadline"
  | "meeting_date"
  | "follow_up_date";

export type ClassifiedImportantDates = {
  shooting_date?: string;
  quote_deadline?: string;
  meeting_date?: string;
  follow_up_date?: string;
  /** Flat M/D(wd) list of every parsed date (legacy / raw) */
  raw_important_date?: string;
};

const ZH_WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

const WEEKDAY_CHAR_TO_JS: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

const RELATIVE_DAY_RE = /後天|后天|明天|明日|今天|今日|\bday\s+after\s+tomorrow\b|\btomorrow\b|\btoday\b/giu;

const NUMERIC_DATE_RE = /(?:(\d{4})[\/\-年])?(\d{1,2})[\/\-月](\d{1,2})(?:日)?/gu;

const WEEKDAY_EXPR_RE =
  /(下下週|下下星期|下下周|下週|下星期|下周|本週|本星期|本周|这周|這週|这週)(?:週|周|星期|禮拜|礼拜)?([一二三四五六日天])|(?:週|周|星期|禮拜|礼拜)([一二三四五六日天])/gu;

const WEEK_ONLY_EXPR_RE =
  /(下下週|下下星期|下下周|下週|下星期|下周|本週|本星期|本周|这周|這週|这週)(?![一二三四五六日天])|\b(next\s+week|this\s+week)\b/giu;

const CLAUSE_SPLIT_RE = /[，,；;。！!？?\n]+/u;

const SHOOTING_CONTEXT_RE =
  /拍攝|拍片|拍影片|拍攝日|想拍|開拍|錄影|拍攝檔|租棚|棚拍|檔期|空檔|哪一天有空|有空檔|希望|档期|shoot|filming|studio\s*booking/i;

const QUOTE_CONTEXT_RE =
  /報價|估價|出價|價格|給價|先給|今日報|今天先|明天先|盡快報|初步報價|報價單|報價期限|回覆期限|先報|quote|quotation|pricing/i;

const MEETING_CONTEXT_RE =
  /開會|會議|討論|碰面|見面|聊聊|視訊|拜訪|meeting|appointment|call\s*with/i;

const FOLLOW_UP_CONTEXT_RE =
  /追蹤|聯絡|聯繫|联系|回電|回覆我|follow\s*up|contact|call\s*back|再聯絡|後續跟進|跟进|跟进联系/i;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeekMonday(ref: Date): Date {
  const d = startOfLocalDay(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function offsetFromMonday(jsWeekday: number): number {
  return jsWeekday === 0 ? 6 : jsWeekday - 1;
}

function parseWeekOffset(prefix: string | undefined): number {
  if (!prefix) return 0;
  const p = prefix.trim();
  if (/下下/.test(p)) return 2;
  if (/下/.test(p)) return 1;
  return 0;
}

function weekdayFromChar(ch: string): number | null {
  return WEEKDAY_CHAR_TO_JS[ch] ?? null;
}

function dateForWeekday(ref: Date, weekOffset: number, jsWeekday: number): Date {
  const weekStart = startOfWeekMonday(ref);
  const d = new Date(weekStart);
  d.setDate(weekStart.getDate() + weekOffset * 7 + offsetFromMonday(jsWeekday));
  return d;
}

function parseRelativeDayToken(token: string, ref: Date): Date | null {
  if (/今天|今日/.test(token)) return startOfLocalDay(ref);
  if (/today/i.test(token)) return startOfLocalDay(ref);
  if (/明天|明日/.test(token) || /^tomorrow$/i.test(token)) {
    const d = startOfLocalDay(ref);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (/後天|后天/.test(token) || /day\s+after\s+tomorrow/i.test(token)) {
    const d = startOfLocalDay(ref);
    d.setDate(d.getDate() + 2);
    return d;
  }
  return null;
}

function parseNumericDateMatch(yearRaw: string | undefined, monthRaw: string, dayRaw: string, ref: Date): Date | null {
  const year = yearRaw ? Number(yearRaw) : ref.getFullYear();
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return startOfLocalDay(d);
}

function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dedupeSortDates(dates: Date[]): Date[] {
  const map = new Map<string, Date>();
  for (const d of dates) {
    map.set(ymdKey(d), startOfLocalDay(d));
  }
  return [...map.values()].sort((a, b) => a.getTime() - b.getTime());
}

function mergeDatesIntoBucket(bucket: Date[], incoming: Date[]): void {
  const map = new Map<string, Date>();
  for (const d of [...bucket, ...incoming]) {
    map.set(ymdKey(d), startOfLocalDay(d));
  }
  bucket.length = 0;
  bucket.push(...[...map.values()].sort((a, b) => a.getTime() - b.getTime()));
}

/** Extract all calendar dates mentioned in a text segment. */
export function parseDatesFromChat(text: string, referenceDate: Date = new Date()): Date[] {
  const raw = text.trim();
  if (!raw) return [];

  const ref = startOfLocalDay(referenceDate);
  const found: Date[] = [];

  for (const m of raw.matchAll(NUMERIC_DATE_RE)) {
    const d = parseNumericDateMatch(m[1], m[2], m[3], ref);
    if (d) found.push(d);
  }

  for (const m of raw.matchAll(RELATIVE_DAY_RE)) {
    const token = m[0];
    const d = parseRelativeDayToken(token, ref);
    if (d) found.push(d);
  }

  for (const m of raw.matchAll(WEEKDAY_EXPR_RE)) {
    const prefix = m[1];
    const ch = m[2] ?? m[3];
    if (!ch) continue;
    const jsWd = weekdayFromChar(ch);
    if (jsWd == null) continue;
    const weekOffset = parseWeekOffset(prefix);
    found.push(dateForWeekday(ref, weekOffset, jsWd));
  }

  for (const m of raw.matchAll(WEEK_ONLY_EXPR_RE)) {
    const zhPrefix = m[1];
    const enPrefix = m[2];
    const weekOffset = enPrefix ? (/\bnext/i.test(enPrefix) ? 1 : 0) : parseWeekOffset(zhPrefix);
    found.push(dateForWeekday(ref, weekOffset, 1));
  }

  return dedupeSortDates(found);
}

/** Classify intent from surrounding clause text (higher-priority rules first). */
export function classifyClauseDateIntent(clause: string): DateIntentType | null {
  const c = clause.trim();
  if (!c) return null;

  if (QUOTE_CONTEXT_RE.test(c)) return "quote_deadline";
  if (MEETING_CONTEXT_RE.test(c)) return "meeting_date";
  if (FOLLOW_UP_CONTEXT_RE.test(c)) return "follow_up_date";
  if (SHOOTING_CONTEXT_RE.test(c)) return "shooting_date";

  if (/希望/.test(c) && /週|星期|周|禮拜|礼拜|明天|今天|後天|后天/.test(c)) {
    return "shooting_date";
  }

  if (/週|星期|周|禮拜|礼拜|\bnext\s+week\b|\bthis\s+week\b/i.test(c)) return "shooting_date";

  if (/明天|今天|後天|后天|今日|明日|\btoday\b|\btomorrow\b/i.test(c)) return "follow_up_date";

  return null;
}

function splitClauses(text: string): string[] {
  return text
    .split(CLAUSE_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** 「今天先給報價」→ treat deadline as tomorrow when only today is mentioned. */
function adjustQuoteDeadlineDates(dates: Date[], clause: string, ref: Date): Date[] {
  if (dates.length === 0) return dates;
  if (!/今天先|今日先|今天.*先給|今日.*先給/u.test(clause)) return dates;

  const refDay = startOfLocalDay(ref);
  const usesToday = dates.some((d) => ymdKey(d) === ymdKey(refDay));
  if (!usesToday) return dates;

  const tomorrow = startOfLocalDay(ref);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dedupeSortDates(
    dates.map((d) => (ymdKey(d) === ymdKey(refDay) ? tomorrow : d)),
  );
}

/** Format one date as M/D(weekday) for zh or M/D (Weekday) for en. */
export function formatImportantDateLabel(d: Date, lang: "zh" | "en"): string {
  const month = d.getMonth() + 1;
  const day = d.getDate();
  if (lang === "zh") {
    const wd = ZH_WEEKDAY_LABELS[d.getDay()];
    return `${month}/${day}(${wd})`;
  }
  const enDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  return `${month}/${day} (${enDays[d.getDay()]})`;
}

/** Join multiple dates with 「、」 (zh) or ", " (en). */
export function formatImportantDates(dates: Date[], lang: "zh" | "en"): string {
  if (dates.length === 0) return "";
  const sep = lang === "zh" ? "、" : ", ";
  return dates.map((d) => formatImportantDateLabel(d, lang)).join(sep);
}

function formatYmd(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** First follow-up date in DB-safe YYYY-MM-DD format. */
export function parseFollowUpDateYmdFromChat(
  text: string,
  referenceDate: Date = new Date(),
): string | null {
  const raw = text.trim();
  if (!raw) return null;

  const followUpDates: Date[] = [];
  const clauses = splitClauses(raw);
  const segments = clauses.length > 0 ? clauses : [raw];

  for (const clause of segments) {
    const dates = parseDatesFromChat(clause, referenceDate);
    if (dates.length === 0) continue;

    const intent = classifyClauseDateIntent(clause);
    if (intent === "follow_up_date") {
      mergeDatesIntoBucket(followUpDates, dates);
    }
  }

  if (followUpDates.length > 0) return formatYmd(followUpDates[0]);

  // This path is used for dedicated follow-up fields such as "明天追蹤" / "Contact next week".
  if (FOLLOW_UP_CONTEXT_RE.test(raw)) {
    const dates = parseDatesFromChat(raw, referenceDate);
    if (dates.length > 0) return formatYmd(dates[0]);
  }

  return null;
}

/** First parsed date in DB-safe YYYY-MM-DD format; use only for dedicated date/follow-up fields. */
export function parseFirstDateYmdFromText(
  text: string,
  referenceDate: Date = new Date(),
): string | null {
  const dates = parseDatesFromChat(text, referenceDate);
  return dates.length > 0 ? formatYmd(dates[0]) : null;
}

/**
 * Parse chat and bucket dates by intent (shooting / quote / meeting / follow-up).
 */
export function parseClassifiedImportantDatesFromChat(
  text: string,
  referenceDate: Date = new Date(),
  lang: "zh" | "en" = "zh",
): ClassifiedImportantDates | null {
  const raw = text.trim();
  if (!raw) return null;

  const buckets: Record<DateIntentType, Date[]> = {
    shooting_date: [],
    quote_deadline: [],
    meeting_date: [],
    follow_up_date: [],
  };

  const clauses = splitClauses(raw);
  const segments = clauses.length > 0 ? clauses : [raw];

  for (const clause of segments) {
    let dates = parseDatesFromChat(clause, referenceDate);
    if (dates.length === 0) continue;

    let intent = classifyClauseDateIntent(clause);
    if (!intent) {
      intent = /下週|本週|週|星期|周|禮拜|礼拜/.test(clause) ? "shooting_date" : "follow_up_date";
    }

    if (intent === "quote_deadline") {
      dates = adjustQuoteDeadlineDates(dates, clause, referenceDate);
    }

    mergeDatesIntoBucket(buckets[intent], dates);
  }

  const allDates = parseDatesFromChat(raw, referenceDate);
  if (allDates.length === 0) return null;

  const result: ClassifiedImportantDates = {
    raw_important_date: formatImportantDates(allDates, lang),
  };

  if (buckets.shooting_date.length > 0) {
    result.shooting_date = formatImportantDates(buckets.shooting_date, lang);
  }
  if (buckets.quote_deadline.length > 0) {
    result.quote_deadline = formatImportantDates(buckets.quote_deadline, lang);
  }
  if (buckets.meeting_date.length > 0) {
    result.meeting_date = formatImportantDates(buckets.meeting_date, lang);
  }
  if (buckets.follow_up_date.length > 0) {
    result.follow_up_date = formatImportantDates(buckets.follow_up_date, lang);
  }

  const hasClassified =
    result.shooting_date || result.quote_deadline || result.meeting_date || result.follow_up_date;
  if (!hasClassified) return null;

  return result;
}

/** Multi-line card copy for Important Date UI. */
export function formatClassifiedImportantDatesDisplay(
  classified: ClassifiedImportantDates,
  lang: "zh" | "en",
): string {
  const blocks: string[] = [];

  if (classified.shooting_date) {
    blocks.push(
      lang === "zh"
        ? `重要拍攝日期\n${classified.shooting_date}`
        : `Shooting dates\n${classified.shooting_date}`,
    );
  }
  if (classified.quote_deadline) {
    blocks.push(
      lang === "zh"
        ? `緊急回覆期限\n${classified.quote_deadline} 前提供初步報價`
        : `Quote deadline\nProvide preliminary quote by ${classified.quote_deadline}`,
    );
  }
  if (classified.meeting_date) {
    blocks.push(
      lang === "zh"
        ? `會議日期\n${classified.meeting_date}`
        : `Meeting date\n${classified.meeting_date}`,
    );
  }
  if (classified.follow_up_date) {
    blocks.push(
      lang === "zh"
        ? `追蹤日期\n${classified.follow_up_date}`
        : `Follow-up date\n${classified.follow_up_date}`,
    );
  }

  if (blocks.length > 0) return blocks.join("\n\n");

  return classified.raw_important_date ?? "";
}

/**
 * Parse chat into display value for important_date (classified if possible).
 */
export function parseImportantDateFromChat(
  text: string,
  referenceDate: Date = new Date(),
  lang: "zh" | "en" = "zh",
): string | null {
  const classified = parseClassifiedImportantDatesFromChat(text, referenceDate, lang);
  if (classified) {
    const display = formatClassifiedImportantDatesDisplay(classified, lang);
    if (display.trim()) return display;
  }

  const dates = parseDatesFromChat(text, referenceDate);
  if (dates.length === 0) return null;
  return formatImportantDates(dates, lang);
}
