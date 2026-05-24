import type { AppLang } from "./appLang";
import type { CrmNotificationType } from "./crmNotifications";

export function crmNotificationBellCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    ariaLabel: zh ? "通知中心" : "Notifications",
    panelTitle: zh ? "通知中心" : "Notifications",
    empty: zh ? "目前沒有通知" : "No notifications",
    markAllRead: zh ? "全部標為已讀" : "Mark all read",
    viewCustomer: zh ? "查看客戶" : "View customer",
    loading: zh ? "載入中…" : "Loading…",
    loadError: zh ? "無法載入通知" : "Could not load notifications",
    justNow: zh ? "剛剛" : "Just now",
    minutesAgo: (n: number) => (zh ? `${n} 分鐘前` : `${n}m ago`),
    hoursAgo: (n: number) => (zh ? `${n} 小時前` : `${n}h ago`),
    daysAgo: (n: number) => (zh ? `${n} 天前` : `${n}d ago`),
    viewAll: zh ? "查看全部" : "View all",
  };
}

export function crmNotificationTypeLabel(type: CrmNotificationType, _lang?: AppLang): string {
  const map: Record<CrmNotificationType, string> = {
    line_message: "LINE 訊息",
    new_customer: "新客戶",
    binding_success: "綁定成功",
    follow_up_reminder: "追蹤提醒",
    urgent_customer: "緊急客戶",
  };
  return map[type] ?? type;
}

export function crmNotificationTypeAccent(type: CrmNotificationType): {
  border: string;
  bg: string;
  dot: string;
} {
  switch (type) {
    case "line_message":
      return {
        border: "rgba(6,199,85,0.45)",
        bg: "rgba(6,199,85,0.12)",
        dot: "#06C755",
      };
    case "new_customer":
      return {
        border: "rgba(99,102,241,0.45)",
        bg: "rgba(99,102,241,0.12)",
        dot: "#818cf8",
      };
    case "binding_success":
      return {
        border: "rgba(34,197,94,0.45)",
        bg: "rgba(34,197,94,0.1)",
        dot: "#4ade80",
      };
    case "follow_up_reminder":
      return {
        border: "rgba(249,115,22,0.45)",
        bg: "rgba(249,115,22,0.1)",
        dot: "#fb923c",
      };
    case "urgent_customer":
      return {
        border: "rgba(239,68,68,0.5)",
        bg: "rgba(239,68,68,0.12)",
        dot: "#f87171",
      };
    default:
      return {
        border: "rgba(148,163,184,0.35)",
        bg: "rgba(15,23,42,0.6)",
        dot: "#94a3b8",
      };
  }
}
