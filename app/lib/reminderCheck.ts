import { isReminderCompleted, type ReminderCustomerRow } from "./calendarReminders";
import {
  diffCalendarDaysYmd,
  formatFollowUpDateDisplay,
  getTaipeiTodayYmd,
  normalizeFollowUpDateValue,
  timestampToTaipeiYmd,
} from "./followUpReminders";
import { resolveCustomerHonorific } from "./customerHonorific";

export const REMINDER_CHECK_SELECT =
  "id, customer_name, company_name, customer_need, estimated_amount, next_step, follow_up, follow_up_date, next_follow_up_at, reminder_status, success_rate";

/** Effective follow-up calendar day: explicit DATE column first, else next_follow_up_at in Taipei. */
function effectiveReminderFollowUpYmd(row: ReminderCustomerRow): string | null {
  const fromDateCol = normalizeFollowUpDateValue(row.follow_up_date);
  if (fromDateCol) return fromDateCol;
  return timestampToTaipeiYmd(row.next_follow_up_at ?? null);
}

export type DueReminderCustomer = ReminderCustomerRow & {
  customer_need?: string | null;
  follow_up_date: string;
  isOverdue: boolean;
  daysPastDue: number;
};

export function isFollowUpDue(followUpDate: unknown, todayYmd: string): boolean {
  const ymd = normalizeFollowUpDateValue(followUpDate);
  if (!ymd) return false;
  return ymd <= todayYmd;
}

/** Customers where Taipei today >= follow-up day and reminder not completed. */
export function filterDueFollowUpCustomers(
  rows: ReminderCustomerRow[],
  today: Date = new Date(),
): DueReminderCustomer[] {
  const todayYmd = getTaipeiTodayYmd(today);
  const due: DueReminderCustomer[] = [];

  for (const row of rows) {
    if (isReminderCompleted(row.reminder_status)) continue;
    const ymd = effectiveReminderFollowUpYmd(row);
    if (!ymd || !isFollowUpDue(ymd, todayYmd)) continue;

    const diff = diffCalendarDaysYmd(ymd, todayYmd);
    const daysPastDue = diff === null || diff <= 0 ? 0 : diff;
    const isOverdue = diff !== null && diff > 0;

    due.push({
      ...row,
      follow_up_date: ymd,
      isOverdue,
      daysPastDue,
    });
  }

  due.sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date));
  return due;
}

function displayName(row: ReminderCustomerRow, lang: "zh" | "en"): string {
  const raw = row.customer_name?.trim();
  if (!raw) return lang === "zh" ? "未提供姓名" : "Name not provided";
  return resolveCustomerHonorific({ customerName: raw, lang }).addressName || raw;
}

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Build LINE Messaging API push body for due follow-ups (notify yourself only). */
export function formatLineReminderMessage(
  customers: DueReminderCustomer[],
  lang: "zh" | "en" = "zh",
): string {
  if (customers.length === 0) {
    return lang === "zh" ? "【CRM提醒】\n今天沒有到期追蹤。" : "【CRM Reminder】\nNo due follow-ups today.";
  }

  const blocks = customers.map((c, index) => {
    const name = displayName(c, lang);
    const company = c.company_name?.trim() || (lang === "zh" ? "—" : "—");
    const need = clip(c.customer_need?.trim() || (lang === "zh" ? "未提供" : "N/A"), 80);
    const budget = c.estimated_amount?.trim() || (lang === "zh" ? "未提供" : "N/A");

    const dateStr = formatFollowUpDateDisplay(c.follow_up_date, lang);

    if (lang === "zh") {
      return [
        `${customers.length > 1 ? `${index + 1}. ` : ""}${name}${c.isOverdue ? "（逾期）" : ""}`,
        `專案：${company}`,
        `需求：${need}`,
        `預算：${budget}`,
        `追蹤日：${dateStr}`,
      ].join("\n");
    }

    const next = clip(c.next_step?.trim() || c.follow_up?.trim() || "Follow up", 80);
    const overdue = c.isOverdue ? `Overdue ${c.daysPastDue} day(s)` : "Due today";
    return [
      `—— ${index + 1}. ${name} ——`,
      overdue,
      `Company: ${company}`,
      `Need: ${need}`,
      `Budget: ${budget}`,
      `Next step: ${next}`,
      `Follow-up: ${dateStr}`,
    ].join("\n");
  });

  let message =
    lang === "zh"
      ? `【CRM提醒】\n今天需追蹤：\n${blocks.join("\n\n")}`
      : `【CRM Reminder】\nDue today:\n${blocks.join("\n\n")}`;

  if (message.length > 4500) {
    const shortBlocks = customers.slice(0, 8).map((c, index) => {
      const name = displayName(c, lang);
      const dateStr = formatFollowUpDateDisplay(c.follow_up_date, lang);
      const flag = c.isOverdue ? (lang === "zh" ? "逾期" : "Late") : lang === "zh" ? "今日" : "Today";
      return `${index + 1}. [${flag}] ${name}（${dateStr}）`;
    });
    const more =
      customers.length > 8
        ? lang === "zh"
          ? `\n…另有 ${customers.length - 8} 位，請至 CRM 查看`
          : `\n…+${customers.length - 8} more in CRM`
        : "";
    message =
      lang === "zh"
        ? `【CRM提醒】\n今天需追蹤：\n${shortBlocks.join("\n")}${more}`
        : `【CRM Reminder】\nDue today:\n${shortBlocks.join("\n")}${more}`;
  }

  return message;
}
