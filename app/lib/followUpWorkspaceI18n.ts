import type { AppLang } from "./appLang";

export function followUpWorkspaceCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    title: zh ? "今日追蹤工作台" : "Today's follow-up workspace",
    dueToday: zh ? "今日待追蹤客戶" : "Due today",
    overdue: zh ? "逾期未追蹤客戶" : "Overdue",
    highDeal: zh ? "高成交機率客戶" : "High deal probability",
    recent: zh ? "最近新增客戶" : "Recently added",
    empty: zh ? "目前沒有客戶" : "No customers",
    loading: zh ? "載入中…" : "Loading…",
    loadError: zh ? "載入失敗" : "Failed to load",
    sqlHint: zh
      ? "請在 Supabase 執行 supabase/sql/add_follow_up_workspace.sql"
      : "Run supabase/sql/add_follow_up_workspace.sql in Supabase",
    customerName: zh ? "客戶姓名" : "Name",
    phone: zh ? "電話" : "Phone",
    lineId: zh ? "LINE ID" : "LINE ID",
    customerNeed: zh ? "需求內容" : "Needs",
    dealProbability: zh ? "成交機率" : "Deal probability",
    followStatus: zh ? "追蹤狀態" : "Follow-up status",
    lastContact: zh ? "最後聯絡時間" : "Last contact",
    nextFollowUp: zh ? "下次追蹤時間" : "Next follow-up",
    remark: zh ? "備註" : "Remark",
    view: zh ? "查看" : "View",
    edit: zh ? "編輯" : "Edit",
    complete: zh ? "完成追蹤" : "Complete",
    postpone: zh ? "延後追蹤" : "Postpone",
    copyLine: zh ? "複製 LINE ID" : "Copy LINE ID",
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
  };
}

export function voiceInputCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    start: zh ? "語音輸入" : "Voice input",
    stop: zh ? "停止" : "Stop",
    unsupported: zh ? "此瀏覽器不支援語音輸入" : "Voice input is not supported in this browser",
    listening: zh ? "聆聽中" : "Listening",
  };
}
