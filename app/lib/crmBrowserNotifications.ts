import type { AppLang } from "./appLang";
import {
  buildNotificationItems,
  type NotificationBucket,
  type NotificationItem,
  type ReminderCustomerRow,
} from "./calendarReminders";
import { notificationBucketTitle } from "./calendarI18n";
import { formatFollowUpDateDisplay, formatLocalYmd, normalizeFollowUpDateValue } from "./followUpReminders";

const STORAGE_KEY = "crmBrowserNotifiedV1";

const BUCKET_PRIORITY: NotificationBucket[] = ["overdue", "due_today", "high_deal", "no_contact_3d"];

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isBrowserNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isBrowserNotificationSupported()) return "unsupported";
  return Notification.requestPermission();
}

function readNotifiedMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeNotifiedMap(map: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/** One notification per customer per local calendar day. */
export function wasCustomerNotifiedToday(customerId: string | number, todayYmd: string): boolean {
  const map = readNotifiedMap();
  return map[String(customerId)] === todayYmd;
}

export function markCustomerNotifiedToday(customerId: string | number, todayYmd: string) {
  const map = readNotifiedMap();
  map[String(customerId)] = todayYmd;
  writeNotifiedMap(map);
}

function pickOneItemPerCustomer(items: NotificationItem[]): NotificationItem[] {
  const best = new Map<string, NotificationItem>();
  for (const item of items) {
    const id = String(item.customer.id);
    const prev = best.get(id);
    if (!prev) {
      best.set(id, item);
      continue;
    }
    const pi = BUCKET_PRIORITY.indexOf(prev.bucket);
    const ni = BUCKET_PRIORITY.indexOf(item.bucket);
    if (ni >= 0 && (pi < 0 || ni < pi)) best.set(id, item);
  }
  return [...best.values()];
}

function buildNotificationBody(item: NotificationItem, lang: AppLang): string {
  const c = item.customer;
  const name = c.customer_name?.trim() || (lang === "zh" ? "未命名客戶" : "Unnamed");
  const company = c.company_name?.trim() || (lang === "zh" ? "—" : "—");
  const next = c.next_step?.trim() || (lang === "zh" ? "—" : "—");
  const ymd = normalizeFollowUpDateValue(c.follow_up_date);
  const dateLine = ymd ? formatFollowUpDateDisplay(ymd, lang) : "—";
  if (lang === "zh") {
    return `${name}\n${company}\n下一步：${next}\n到期：${dateLine}`;
  }
  return `${name}\n${company}\nNext: ${next}\nDue: ${dateLine}`;
}

function showBrowserNotification(item: NotificationItem, lang: AppLang, todayYmd: string): boolean {
  if (!isBrowserNotificationSupported() || Notification.permission !== "granted") return false;
  if (wasCustomerNotifiedToday(item.customer.id, todayYmd)) return false;

  const title = notificationBucketTitle(item.bucket, lang);
  const body = buildNotificationBody(item, lang);
  const url = `/customers/${item.customer.id}`;
  const tag = `crm-${item.customer.id}-${todayYmd}`;

  try {
    const n = new Notification(title, {
      body,
      tag,
      data: { url },
      icon: "/favicon.ico",
    });
    n.onclick = (ev) => {
      ev.preventDefault();
      window.focus();
      window.location.href = url;
      n.close();
    };
    markCustomerNotifiedToday(item.customer.id, todayYmd);
    return true;
  } catch {
    return false;
  }
}

/** Fire CRM reminder notifications (deduped per customer per day). Returns count shown. */
export function dispatchCrmBrowserNotifications(
  rows: ReminderCustomerRow[],
  lang: AppLang,
): number {
  if (!isBrowserNotificationSupported() || Notification.permission !== "granted") return 0;

  const todayYmd = formatLocalYmd(new Date());
  const items = pickOneItemPerCustomer(buildNotificationItems(rows));
  let shown = 0;

  for (const item of items) {
    if (showBrowserNotification(item, lang, todayYmd)) shown += 1;
  }

  return shown;
}
