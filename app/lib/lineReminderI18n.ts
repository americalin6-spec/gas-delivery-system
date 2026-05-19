import type { AppLang } from "./appLang";

export function lineReminderSettingsCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    title: zh ? "LINE 通知設定" : "LINE notification settings",
    subtitle: zh
      ? "每天早上 9:00（台北時間）檢查到期的 CRM 追蹤，透過 LINE Messaging API 推播到您自己的 LINE。不會自動發送給客戶。"
      : "Each day at 9:00 (Taipei), due CRM follow-ups are pushed to your own LINE via Messaging API. Customers are never messaged automatically.",
    backAlerts: zh ? "← 返回提醒中心" : "← Back to alerts",
    backHome: zh ? "← 回到首頁" : "← Back to home",
    enabled: zh ? "開啟每日提醒" : "Enable daily reminders",
    enabledHint: zh ? "關閉後 cron 不會發送 LINE 通知" : "When off, scheduled checks will not notify",
    tokenLabel: zh ? "Channel Access Token" : "Channel Access Token",
    tokenPlaceholder: zh ? "貼上 LINE Developers 的 Channel Access Token" : "Paste Channel Access Token from LINE Developers",
    tokenHint: zh
      ? "請使用 LINE Developers Messaging API 的長期 Channel Access Token。Bot 必須已加您為好友。"
      : "Use a long-lived Messaging API Channel Access Token. Your LINE account must be friends with the bot.",
    userIdLabel: zh ? "User ID" : "User ID",
    userIdPlaceholder: zh ? "貼上您的 LINE User ID（U 開頭）" : "Paste your LINE User ID (starts with U)",
    userIdHint: zh
      ? "這是要接收提醒的您本人 LINE User ID，不是 LINE ID。"
      : "This is your LINE platform User ID, not your LINE ID.",
    tokenMasked: zh ? "已儲存 Token：" : "Saved token:",
    hourLabel: zh ? "每日檢查時間（台北時間）" : "Daily check hour (Taipei)",
    save: zh ? "儲存設定" : "Save settings",
    saving: zh ? "儲存中…" : "Saving…",
    saved: zh ? "已儲存" : "Saved",
    testSend: zh ? "發送測試通知" : "Send test notification",
    testSending: zh ? "發送中…" : "Sending…",
    testOk: zh ? "測試通知已發送到您的 LINE" : "Test notification sent to your LINE",
    runNow: zh ? "立即執行到期檢查" : "Run due check now",
    running: zh ? "執行中…" : "Running…",
    lastSent: zh ? "上次發送日期" : "Last sent date",
    duePreview: zh ? "目前到期客戶預覽" : "Due customers preview",
    noDue: zh ? "目前沒有到期追蹤（follow_up_date ≤ 今日）" : "No due follow-ups (follow_up_date ≤ today)",
    cronTitle: zh ? "Cron 排程" : "Cron schedule",
    cronBody: zh
      ? "Vercel Cron 每日 01:00 UTC（台北 09:00）呼叫 /api/reminder-check。請在環境變數設定 CRON_SECRET。"
      : "Vercel Cron hits /api/reminder-check daily at 01:00 UTC (09:00 Taipei). Set CRON_SECRET in env.",
    loadError: zh ? "無法載入設定" : "Could not load settings",
    saveError: zh ? "儲存失敗" : "Save failed",
    testError: zh ? "測試發送失敗" : "Test send failed",
    clearToken: zh ? "清除 Token" : "Clear token",
    futureNote: zh
      ? "目前只推播提醒給您本人。未來支援：一鍵傳送追蹤訊息、AI 自動產生 follow-up。"
      : "Currently pushes reminders to you only. Coming soon: one-tap follow-up send and AI-generated follow-up.",
  };
}
