import type { AppLang } from "./appLang";

export function followUpWorkspaceCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    title: zh ? "今日追蹤工作台" : "Today's follow-up workspace",
    dueToday: zh ? "今日待追蹤客戶" : "Due today",
    overdue: zh ? "逾期未追蹤客戶" : "Overdue",
    highDeal: zh ? "高成交機率客戶" : "High deal probability",
    recent: zh ? "近7日新增客戶" : "Recently added",
    empty: zh ? "目前沒有客戶" : "No customers",
    searchPlaceholder: zh
      ? "搜尋姓名 / 電話 / LINE / 需求 / 備註"
      : "Search name, phone, LINE, needs, notes",
    loading: zh ? "載入中…" : "Loading…",
    loadError: zh ? "載入失敗" : "Failed to load",
    sqlHint: zh
      ? "請在 Supabase 執行 supabase/sql/add_follow_up_workspace.sql"
      : "Run supabase/sql/add_follow_up_workspace.sql in Supabase",
    customerName: zh ? "客戶姓名" : "Name",
    phone: zh ? "電話" : "Phone",
    lineId: zh ? "LINE 帳號" : "LINE ID",
    customerNeed: zh ? "需求內容" : "Needs",
    dealProbability: zh ? "成交機率" : "Deal probability",
    customerStatus: zh ? "客戶狀態" : "Customer status",
    lastContact: zh ? "最後聯絡時間" : "Last contact",
    createdAt: zh ? "建檔時間" : "Created",
    remark: zh ? "備註" : "Remark",
    view: zh ? "查看" : "View",
    edit: zh ? "編輯" : "Edit",
    complete: zh ? "完成追蹤" : "Complete",
    postpone: zh ? "延後追蹤" : "Postpone",
    copyLine: zh ? "複製 LINE 帳號" : "Copy LINE ID",
    copyPhone: zh ? "複製電話" : "Copy phone",
    completeTitle: zh ? "完成追蹤" : "Complete follow-up",
    postponeTitle: zh ? "延後追蹤" : "Postpone follow-up",
    followUpNote: zh ? "追蹤備註" : "Follow-up note",
    nextFollowUpPick: zh ? "下次追蹤時間" : "Next follow-up time",
    save: zh ? "儲存" : "Save",
    cancel: zh ? "取消" : "Cancel",
    saving: zh ? "儲存中…" : "Saving…",
    saved: zh ? "已更新" : "Updated",
    postpone1h: zh ? "1 小時後" : "In 1 hour",
    postponeTomorrow: zh ? "明天" : "Tomorrow",
    postpone3d: zh ? "3 天後" : "In 3 days",
    postponeNextWeek: zh ? "下週" : "Next week",
    unnamed: zh ? "未命名客戶" : "Unnamed",
    viewAll: zh ? "查看全部" : "View all",
    statusOverview: zh ? "客戶狀態統計" : "Customer status overview",
    activeCustomers: zh ? "追蹤中" : "Active",
    urgentToday: zh ? "今天立即處理" : "Handle today",
    urgentCase: zh ? "緊急案件" : "Urgent",
    calendar: zh ? "行事曆" : "Calendar",
    alerts: zh ? "通知中心" : "Alerts",
    backHome: zh ? "返回首頁" : "Back to home",
    previewMore: zh ? "等" : "and",
    previewOthers: zh ? "位" : " more",
  };
}
