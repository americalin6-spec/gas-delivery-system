import { formatLocalYmd, normalizeFollowUpDateValue } from "./followUpReminders";
import type { ReminderCustomerRow } from "./calendarReminders";

export type MonthCell = {
  ymd: string | null;
  day: number;
  inMonth: boolean;
  isToday: boolean;
};

export function monthTitle(year: number, monthIndex: number, lang: "zh" | "en"): string {
  if (lang === "zh") return `${year}年${monthIndex + 1}月`;
  const d = new Date(year, monthIndex, 1);
  try {
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } catch {
    return `${year}-${monthIndex + 1}`;
  }
}

export function weekdayLabels(lang: "zh" | "en"): string[] {
  if (lang === "zh") return ["日", "一", "二", "三", "四", "五", "六"];
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
}

/** Build 6×7 month grid (weeks start Sunday, Apple Calendar style). */
export function buildMonthGrid(year: number, monthIndex: number): MonthCell[] {
  const todayYmd = formatLocalYmd(new Date());
  const first = new Date(year, monthIndex, 1);
  const startOffset = first.getDay();
  const gridStart = new Date(year, monthIndex, 1 - startOffset);

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const ymd = formatLocalYmd(d);
    cells.push({
      ymd,
      day: d.getDate(),
      inMonth: d.getMonth() === monthIndex,
      isToday: ymd === todayYmd,
    });
  }
  return cells;
}

export function isYmdInMonth(ymd: string, year: number, monthIndex: number): boolean {
  const m = /^(\d{4})-(\d{2})/.exec(ymd);
  if (!m) return false;
  return Number(m[1]) === year && Number(m[2]) === monthIndex + 1;
}

export function groupCustomersByFollowUpDate(
  rows: ReminderCustomerRow[],
): Map<string, ReminderCustomerRow[]> {
  const map = new Map<string, ReminderCustomerRow[]>();
  for (const row of rows) {
    const ymd = normalizeFollowUpDateValue(row.follow_up_date);
    if (!ymd) continue;
    const list = map.get(ymd) ?? [];
    list.push(row);
    map.set(ymd, list);
  }
  for (const [k, list] of map) {
    list.sort((a, b) => String(a.customer_name).localeCompare(String(b.customer_name)));
    map.set(k, list);
  }
  return map;
}

export function customersInMonth(
  rows: ReminderCustomerRow[],
  year: number,
  monthIndex: number,
): ReminderCustomerRow[] {
  return rows.filter((r) => {
    const ymd = normalizeFollowUpDateValue(r.follow_up_date);
    return ymd ? isYmdInMonth(ymd, year, monthIndex) : false;
  });
}

/** Sorted dates in month that have at least one reminder. */
export function datedReminderDaysInMonth(
  byDate: Map<string, ReminderCustomerRow[]>,
  year: number,
  monthIndex: number,
): string[] {
  return [...byDate.keys()]
    .filter((ymd) => isYmdInMonth(ymd, year, monthIndex))
    .sort();
}
