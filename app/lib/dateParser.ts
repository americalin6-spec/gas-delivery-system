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
  /拍攝|拍片|拍影片|拍攝日|想拍|開拍|錄影|拍攝檔|租棚|棚拍|檔期|空檔|哪一天有空|有空檔|档期|交片|成片|品牌影片|形象片|video|shoot|filming|studio\s*booking/i;

const PHOTOGRAPHY_CONVERSATION_RE =
  /拍攝|拍片|攝影|摄影|租棚|棚拍|模特|麻豆|妝髮|妆发|形象片|品牌影片|想拍|video shoot|studio shoot|filming/i;

/** True when chat is clearly about photography / video production (not general CRM). */
export function conversationMentionsPhotography(text: string): boolean {
  return PHOTOGRAPHY_CONVERSATION_RE.test(text.trim());
}

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

export type ExplicitDateAnchor = {
  date: Date;
  /** Verbatim phrase from the conversation that authorizes this date. */
  matchedText: string;
};

function normalizeTextForSubstringMatch(text: string): string {
  return text
    .replace(/\s+/gu, "")
    .replace(/　/gu, "")
    .toLowerCase();
}

/** True when `needle` appears in `haystack` (ignores spaces / fullwidth space). */
export function explicitDatePhraseFoundInSource(needle: string, sourceText: string): boolean {
  const n = normalizeTextForSubstringMatch(needle.trim());
  const h = normalizeTextForSubstringMatch(sourceText);
  if (!n || !h) return false;
  return h.includes(n);
}

/**
 * Parse only calendar anchors literally written in chat (no inferred deadlines).
 * Allowed: 5/18, 2026/05/18, 6月1日, 明天, 下週三, 週五 — not「下週」alone, not「兩週內」.
 */
export function parseExplicitDateAnchorsFromChat(
  text: string,
  referenceDate: Date = new Date(),
): ExplicitDateAnchor[] {
  const raw = text.trim();
  if (!raw) return [];

  const ref = startOfLocalDay(referenceDate);
  const anchors: ExplicitDateAnchor[] = [];

  for (const m of raw.matchAll(NUMERIC_DATE_RE)) {
    const d = parseNumericDateMatch(m[1], m[2], m[3], ref);
    if (d) anchors.push({ date: d, matchedText: m[0] });
  }

  for (const m of raw.matchAll(RELATIVE_DAY_RE)) {
    const token = m[0];
    const d = parseRelativeDayToken(token, ref);
    if (d) anchors.push({ date: d, matchedText: token });
  }

  for (const m of raw.matchAll(WEEKDAY_EXPR_RE)) {
    // Only anchored weekdays: 下週三、下星期五 — not bare 週五/星期五 inferred from context.
    if (!m[1]) continue;
    const ch = m[2];
    if (!ch) continue;
    const jsWd = weekdayFromChar(ch);
    if (jsWd == null) continue;
    const weekOffset = parseWeekOffset(m[1]);
    anchors.push({
      date: dateForWeekday(ref, weekOffset, jsWd),
      matchedText: m[0],
    });
  }

  const deduped = new Map<string, ExplicitDateAnchor>();
  for (const a of anchors) {
    deduped.set(`${ymdKey(a.date)}:${a.matchedText}`, a);
  }
  return [...deduped.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Drop anchors whose matched phrase is not present in the full conversation. */
export function filterAnchorsVerifiedInSource(
  anchors: ExplicitDateAnchor[],
  sourceText: string,
): ExplicitDateAnchor[] {
  return anchors.filter((a) => explicitDatePhraseFoundInSource(a.matchedText, sourceText));
}

/** important_dates: formatted labels only when explicitly written (otherwise []). */
export function extractExplicitImportantDatesList(
  text: string,
  referenceDate: Date = new Date(),
  lang: "zh" | "en" = "zh",
): string[] {
  const raw = text.trim();
  if (!raw) return [];

  const verified = filterAnchorsVerifiedInSource(
    parseExplicitDateAnchorsFromChat(raw, referenceDate),
    raw,
  );
  return verified.map((a) => formatImportantDateLabel(a.date, lang));
}

function mergeDatesIntoBucket(bucket: Date[], incoming: Date[]): void {
  const map = new Map<string, Date>();
  for (const d of [...bucket, ...incoming]) {
    map.set(ymdKey(d), startOfLocalDay(d));
  }
  bucket.length = 0;
  bucket.push(...[...map.values()].sort((a, b) => a.getTime() - b.getTime()));
}

function addDays(ref: Date, days: number): Date {
  const d = startOfLocalDay(ref);
  d.setDate(d.getDate() + days);
  return d;
}

function endOfMonthContaining(ref: Date): Date {
  const d = startOfLocalDay(ref);
  return startOfLocalDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function endOfNextCalendarMonth(ref: Date): Date {
  const d = startOfLocalDay(ref);
  return startOfLocalDay(new Date(d.getFullYear(), d.getMonth() + 2, 0));
}

function firstDayOfNextCalendarMonth(ref: Date): Date {
  const d = startOfLocalDay(ref);
  return startOfLocalDay(new Date(d.getFullYear(), d.getMonth() + 1, 1));
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

  // Chinese / English fuzzy deadlines (no digits in phrase)
  if (/(下(?:個)?月底|下个月月底)/u.test(raw)) {
    found.push(endOfNextCalendarMonth(ref));
  } else if (/(?:本|這個|这个)?月底|本月最後一天|本月最后一天/u.test(raw)) {
    found.push(endOfMonthContaining(ref));
  } else if (/(?:下個月|下个月|來月)(?!底)/u.test(raw)) {
    found.push(firstDayOfNextCalendarMonth(ref));
  }

  if (/兩週內|二週內|两周内|十四天內|14\s*天內/u.test(raw)) {
    found.push(addDays(ref, 14));
  }
  if (/一週內|一周內|7\s*天內|七天內/u.test(raw)) {
    found.push(addDays(ref, 7));
  }
  if (/三天內|三日內/u.test(raw)) {
    found.push(addDays(ref, 3));
  }

  if (/\b(end\s+of\s+(?:this\s+)?month)\b/i.test(raw)) {
    found.push(endOfMonthContaining(ref));
  }
  if (/\bnext\s+month\b/i.test(raw)) {
    found.push(firstDayOfNextCalendarMonth(ref));
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
  if (SHOOTING_CONTEXT_RE.test(c) && conversationMentionsPhotography(c)) {
    return "shooting_date";
  }

  if (
    /希望/.test(c) &&
    /週|星期|周|禮拜|礼拜|明天|今天|後天|后天/.test(c) &&
    conversationMentionsPhotography(c)
  ) {
    return "shooting_date";
  }

  if (
    /週|星期|周|禮拜|礼拜|\bnext\s+week\b|\bthis\s+week\b/i.test(c) &&
    conversationMentionsPhotography(c)
  ) {
    return "shooting_date";
  }

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

/** All explicit calendar anchors in source text as YYYY-MM-DD (verified substrings only). */
export function explicitFollowUpYmdsFromSource(
  text: string,
  referenceDate: Date = new Date(),
): string[] {
  const raw = text.trim();
  if (!raw) return [];
  return filterAnchorsVerifiedInSource(parseExplicitDateAnchorsFromChat(raw, referenceDate), raw).map(
    (a) => formatYmd(a.date),
  );
}

/** First explicit follow-up date from original conversation (no inferred / vague phrases). */
export function parseExplicitFollowUpDateYmdFromChat(
  text: string,
  referenceDate: Date = new Date(),
): string | null {
  const ymds = explicitFollowUpYmdsFromSource(text, referenceDate);
  return ymds.length > 0 ? ymds[0] : null;
}

/** First follow-up date in DB-safe YYYY-MM-DD format (explicit conversation anchors only). */
export function parseFollowUpDateYmdFromChat(
  text: string,
  referenceDate: Date = new Date(),
): string | null {
  return parseExplicitFollowUpDateYmdFromChat(text, referenceDate);
}

/** First parsed date in DB-safe YYYY-MM-DD format (explicit anchors only). */
export function parseFirstDateYmdFromText(
  text: string,
  referenceDate: Date = new Date(),
): string | null {
  return parseExplicitFollowUpDateYmdFromChat(text, referenceDate);
}

/**
 * Parse chat into important_dates — explicit literal anchors only (no inferred buckets).
 */
export function parseClassifiedImportantDatesFromChat(
  text: string,
  referenceDate: Date = new Date(),
  lang: "zh" | "en" = "zh",
): ClassifiedImportantDates | null {
  const list = extractExplicitImportantDatesList(text, referenceDate, lang);
  if (list.length === 0) return null;

  const joined = list.join(lang === "zh" ? "、" : ", ");
  return { raw_important_date: joined };
}

/** True when clause contains a literal date anchor present in its own text. */
export function isExplicitImportantDateClause(clause: string): boolean {
  const c = clause.trim();
  if (!c) return false;
  return (
    filterAnchorsVerifiedInSource(parseExplicitDateAnchorsFromChat(c, new Date()), c).length > 0
  );
}

const VAGUE_FOLLOW_UP_RE =
  /下週|下周|本週|本周|老闆|主管|董事長|demo|先看看|先看到|回覆|回复|聯絡|联系|追蹤|跟进|follow\s*up|contact|再看|評估|评估/i;

/** Important dates for CRM — explicit anchors only; never invents deadlines or weekdays. */
export function extractExplicitImportantDateDisplay(
  text: string,
  referenceDate: Date = new Date(),
  lang: "zh" | "en" = "zh",
): string | null {
  const list = extractExplicitImportantDatesList(text, referenceDate, lang);
  if (list.length === 0) return null;

  const joined = list.join(lang === "zh" ? "、" : ", ");
  return lang === "zh" ? `重要日期\n${joined}` : `Important dates\n${joined}`;
}

/** Vague timing / demo / boss review → follow-up suggestion (not important_date). */
export function extractFollowUpSuggestionFromChat(
  text: string,
  lang: "zh" | "en" = "zh",
): string {
  const raw = text.trim();
  if (!raw) return lang === "zh" ? "未提供" : "Not provided";

  const hints: string[] = [];
  for (const clause of splitClauses(raw)) {
    if (!VAGUE_FOLLOW_UP_RE.test(clause)) continue;
    if (isExplicitImportantDateClause(clause)) continue;
    if (/^第[一二三四五六七八九十\d]/u.test(clause)) continue;
    if (/病患|病歷|術後|預約|回診|分類需求|高單價|手機版|分店/i.test(clause)) {
      continue;
    }
    const trimmed = clause.trim().slice(0, 48);
    if (trimmed.length >= 4 && !hints.includes(trimmed)) {
      hints.push(trimmed);
    }
  }

  if (hints.length === 0) return lang === "zh" ? "未提供" : "Not provided";
  return hints.slice(0, 2).join(lang === "zh" ? "；" : "; ");
}

/** Multi-line card copy for Important Date UI (explicit dates only). */
export function formatClassifiedImportantDatesDisplay(
  classified: ClassifiedImportantDates,
  lang: "zh" | "en",
): string {
  const raw = classified.raw_important_date?.trim();
  if (!raw) return "";

  return lang === "zh" ? `重要日期\n${raw}` : `Important dates\n${raw}`;
}

/**
 * Parse chat into display value for important_date (explicit literal anchors only).
 */
export function parseImportantDateFromChat(
  text: string,
  referenceDate: Date = new Date(),
  lang: "zh" | "en" = "zh",
): string | null {
  return extractExplicitImportantDateDisplay(text, referenceDate, lang);
}
