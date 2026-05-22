import type { AppLang } from "./appLang";
import { sharedUiCopy } from "./uiI18n";
import type { NotificationBucket } from "./calendarReminders";

export function calendarPageCopy(lang: AppLang) {
  const zh = lang === "zh";
  const s = sharedUiCopy(lang);
  return {
    ...s,
    title: zh ? "提醒行事曆" : "Reminder calendar",
    subtitle: (count: number, loading: boolean) =>
      zh
        ? `共 ${count} 筆追蹤排程${loading ? " · 載入中…" : ""}`
        : `${count} scheduled follow-ups${loading ? " · Loading…" : ""}`,
    empty: zh ? "目前沒有設定追蹤日期的客戶。高成交率存檔時會自動排程，也可在客戶詳情編輯。" : "No follow-up dates yet.",
    followUpDate: zh ? "追蹤日期" : "Follow-up date",
    nextStep: zh ? "下一步" : "Next step",
    followUpMsg: zh ? "追蹤訊息" : "Follow-up message",
    estimatedAmount: zh ? "預估金額" : "Estimated amount",
    dealRate: zh ? "成交率" : "Deal probability",
    viewCustomer: zh ? "查看客戶" : "View customer",
    markCompleted: zh ? "標記已完成" : "Mark completed",
    lineOaSend: zh ? "LINE 官方帳號發送（即將推出）" : "LINE OA send (coming soon)",
    lineOaHint: zh
      ? "預留 Messaging API，目前僅提醒，不會自動發送。"
      : "Reserved for Messaging API — reminders only for now.",
    sqlHint: zh
      ? "若載入失敗，請在 Supabase 執行 supabase/sql/add_urgency_and_reminder_status.sql"
      : "If load fails, run supabase/sql/add_urgency_and_reminder_status.sql in Supabase.",
    unnamed: zh ? "未命名客戶" : "Unnamed customer",
    prevMonth: zh ? "上個月" : "Previous",
    nextMonth: zh ? "下個月" : "Next",
    today: zh ? "今天" : "Today",
    noRemindersThisMonth: zh ? "本月沒有追蹤排程。" : "No follow-ups scheduled this month.",
    mobileDateList: zh ? "本月追蹤" : "This month",
    groupsTitle: zh ? "近期追蹤" : "Upcoming follow-ups",
    groupsLead: zh ? "只顯示有追蹤日的客戶。" : "Only customers with a follow-up date.",
    groupOverdue: zh ? "逾期" : "Overdue",
    groupToday: zh ? "今天" : "Today",
    groupNext7: zh ? "未來 7 天" : "Next 7 days",
    groupEmptyOverdue: zh ? "沒有逾期追蹤。" : "No overdue follow-ups.",
    groupEmptyToday: zh ? "今天沒有追蹤排程。" : "No follow-ups due today.",
    groupEmptyNext7: zh ? "未來 7 天沒有追蹤。" : "No follow-ups in the next 7 days.",
    daysOverdue: (n: number) => (zh ? `已逾期 ${n} 天` : `${n} day(s) overdue`),
    daysUntil: (n: number) => (zh ? `${n} 天後` : `in ${n} day(s)`),
  };
}

export function browserNotificationCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    enable: zh ? "啟用通知" : "Enable notifications",
    requesting: zh ? "請求中…" : "Requesting…",
    prompt: zh
      ? "開啟瀏覽器通知，今日追蹤、逾期、高成交率與久未聯絡時會提醒您（不會自動發送 LINE）。"
      : "Enable browser alerts for due today, overdue, high deals, and stale contact (no auto LINE).",
    enabled: zh ? "瀏覽器通知已啟用" : "Browser notifications enabled",
    denied: zh
      ? "通知權限已拒絕，請在瀏覽器網站設定中允許通知後重新整理。"
      : "Notifications blocked — allow them in browser site settings and refresh.",
    unsupported: zh ? "此瀏覽器不支援系統通知" : "This browser does not support system notifications",
  };
}

export function alertsPageCopy(lang: AppLang) {
  const zh = lang === "zh";
  const s = sharedUiCopy(lang);
  return {
    ...s,
    title: zh ? "通知中心" : "Notification center",
    subtitle: zh ? "依追蹤日、成交率與聯絡紀錄整理" : "Grouped by follow-up, deal rate, and contact history",
    subtitleAll: zh ? "完整通知清單" : "All notifications",
    empty: zh ? "目前沒有需要通知的項目。" : "No notifications right now.",
    dueToday: zh ? "今日要追蹤" : "Due today",
    overdue: zh ? "已逾期" : "Overdue",
    highDeal: zh ? "高成交率客戶" : "High deal probability",
    noContact3d: zh ? "7 天沒聯絡" : "No contact in 7+ days",
    viewAllCalendar: zh ? "查看完整行事曆" : "View full calendar",
    viewAllNotifications: zh ? "查看全部通知" : "View all notifications",
    backToAlerts: zh ? "← 返回通知中心" : "← Back to alerts",
    moreCount: (n: number) => (zh ? `另有 ${n} 則通知` : `${n} more notifications`),
    lineNotifySettings: zh ? "LINE 通知設定" : "LINE notification settings",
    viewCustomer: zh ? "查看客戶" : "View customer",
    lineOaSend: zh ? "LINE 官方帳號發送（即將推出）" : "LINE OA send (coming soon)",
    unnamed: zh ? "未命名客戶" : "Unnamed customer",
  };
}

export function homeCalendarCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    calendarTitle: zh ? "提醒行事曆" : "Reminder calendar",
    calendarLead: zh ? "依追蹤日期顯示客戶，點擊進入詳情。" : "Customers by follow-up date — tap to open detail.",
    calendarEmpty: zh ? "尚無追蹤排程。" : "No scheduled follow-ups.",
    viewCalendar: zh ? "查看行事曆" : "Open calendar",
    alertsTitle: zh ? "通知中心" : "Notifications",
    alertsLead: zh ? "今日追蹤、逾期、高成交率、久未聯絡。" : "Due today, overdue, high deals, stale contact.",
    viewAlerts: zh ? "查看全部通知" : "View all alerts",
    menuCalendar: zh ? "行事曆" : "Calendar",
    menuAlerts: zh ? "通知中心" : "Alerts",
  };
}

export function notificationBucketTitle(bucket: NotificationBucket, lang: AppLang): string {
  const t = alertsPageCopy(lang);
  const map: Record<NotificationBucket, string> = {
    due_today: t.dueToday,
    overdue: t.overdue,
    high_deal: t.highDeal,
    no_contact_3d: t.noContact3d,
  };
  return map[bucket];
}
