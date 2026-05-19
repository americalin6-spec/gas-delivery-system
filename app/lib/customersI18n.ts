import type { FollowUpBadge } from "./followUpReminders";
import type { AppLang } from "./appLang";

export function followUpBadgeLabelForLang(badge: FollowUpBadge, lang: AppLang): string {
  if (lang === "en") {
    const en: Record<FollowUpBadge, string> = {
      none: "",
      overdue: "Overdue",
      soon: "Due soon",
      upcoming: "Scheduled",
    };
    return en[badge];
  }
  const zh: Record<FollowUpBadge, string> = {
    none: "",
    overdue: "逾期",
    soon: "即將到期",
    upcoming: "已排程",
  };
  return zh[badge];
}

export function customersListCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    title: zh ? "客戶資料庫 CRM" : "Customer CRM",
    count: (total: number, shown: number) =>
      zh ? `共 ${total} 筆 · 顯示 ${shown} 筆` : `${total} total · showing ${shown}`,
    backHome: zh ? "← 回到 LINE Work AI" : "← Back to LINE Work AI",
    searchPlaceholder: zh
      ? "搜尋姓名 / 公司 / 電話 / LINE / Email"
      : "Search name / company / phone / LINE / email",
    enterName: zh ? "請輸入客戶姓名" : "Please enter customer name",
    addSuccess: zh ? "新增成功" : "Customer added",
    confirmDelete: zh ? "確定刪除？" : "Delete this customer?",
    unnamed: zh ? "未命名客戶" : "Unnamed customer",
    unknown: zh ? "未知" : "Unknown",
    company: zh ? "公司" : "Company",
    phone: zh ? "電話" : "Phone",
    customerNeed: zh ? "客戶需求" : "Customer needs",
    customerEmotion: zh ? "客戶情緒" : "Emotion",
    importantDate: zh ? "重要日期" : "Important date",
    nextStep: zh ? "下一步" : "Next step",
    estimatedAmount: zh ? "預估金額" : "Estimated amount",
    dealProbability: zh ? "成交機率" : "Deal probability",
    churnRisk: zh ? "流失風險" : "Churn risk",
    todo: zh ? "待辦事項" : "Todo",
    replySuggestion: zh ? "回覆建議" : "Reply suggestion",
    followUp: zh ? "Follow Up" : "Follow up",
    aiSend: zh ? "AI 發送" : "AI send",
    followUpReminder: zh ? "追蹤提醒" : "Follow-up",
    note: zh ? "備註" : "Note",
    viewDetail: zh ? "查看詳情" : "View details",
    deleteCustomer: zh ? "刪除客戶" : "Delete",
    addCustomer: zh ? "新增客戶" : "Add customer",
    addCustomerBtn: zh ? "＋ 新增客戶" : "+ Add customer",
    namePlaceholder: zh ? "客戶姓名" : "Customer name",
    companyPlaceholder: zh ? "公司名稱" : "Company name",
    phonePlaceholder: zh ? "電話" : "Phone",
    followUpTitle: (date: string) => (zh ? `追蹤：${date}` : `Follow-up: ${date}`),
  };
}

export type CustomerDetailCopy = ReturnType<typeof customerDetailCopy>;

export function customerDetailCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    customerList: zh ? "客戶列表" : "Customers",
    loading: zh ? "載入客戶資料中…" : "Loading customer…",
    notFoundTitle: zh ? "找不到客戶" : "Customer not found",
    notFoundBody: zh ? "此客戶不存在或已被刪除。" : "This customer does not exist or was deleted.",
    detailEyebrow: zh ? "客戶詳情" : "Customer detail",
    unnamed: zh ? "未命名客戶" : "Unnamed customer",
    dealProbability: zh ? "成交機率" : "Deal probability",
    followUpPrefix: zh ? "追蹤" : "Follow-up",
    edit: zh ? "編輯" : "Edit",
    delete: zh ? "刪除" : "Delete",
    deleting: zh ? "刪除中…" : "Deleting…",
    save: zh ? "儲存變更" : "Save changes",
    saving: zh ? "儲存中…" : "Saving…",
    cancel: zh ? "取消" : "Cancel",
    saved: zh ? "已儲存" : "Saved",
    confirmDelete: zh ? "確定要刪除此客戶嗎？" : "Delete this customer?",
    followUpModeTitle: zh ? "AI 追蹤發送模式" : "AI follow-up send mode",
    lineNotConnected: zh ? "尚未連接真實 LINE，以下為模擬流程" : "LINE is not connected; flows below are simulated",
    syncing: zh ? "同步中…" : "Syncing…",
    sectionBasic: zh ? "基本資料" : "Basic info",
    sectionAi: zh ? "AI 分析" : "AI analysis",
    sectionFollow: zh ? "追蹤與回覆" : "Follow-up & replies",
    sectionMetrics: zh ? "指標與分析" : "Metrics & analysis",
    sectionFollowPanel: zh ? "追蹤與回覆" : "Follow-up & replies",
    sectionRecords: zh ? "記錄" : "Records",
    createdAt: zh ? "建立時間" : "Created",
    updatedAt: zh ? "更新時間" : "Updated",
    lastContact: zh ? "上次聯絡（模擬發送）" : "Last contact (simulated)",
    fieldLabels: {
      customer_name: zh ? "客戶姓名" : "Customer name",
      company_name: zh ? "公司" : "Company",
      phone: zh ? "電話" : "Phone",
      line_id: "LINE",
      email: "Email",
      note: zh ? "備註" : "Note",
      customer_need: zh ? "客戶需求" : "Customer needs",
      customer_emotion: zh ? "客戶情緒" : "Emotion",
      important_date: zh ? "重要日期" : "Important date",
      estimated_amount: zh ? "預估金額" : "Estimated amount",
      success_rate: zh ? "成交機率" : "Deal probability",
      customer_level: zh ? "客戶等級" : "Customer level",
      churn_risk: zh ? "流失風險" : "Churn risk",
      next_step: zh ? "下一步" : "Next step",
      follow_up_mode: zh ? "AI 追蹤發送模式" : "AI follow-up send mode",
      follow_up_date: zh ? "追蹤提醒日期" : "Follow-up reminder date",
      todo: zh ? "待辦事項" : "Todo",
      follow_up: zh ? "追蹤訊息" : "Follow-up message",
      reply_suggestion: zh ? "專業回覆" : "Reply suggestion",
    },
    lineQuickContact: zh ? "快速聯絡" : "Quick contact",
    lineQuickLead: zh
      ? "複製 LINE ID 後在 LINE 內搜尋加好友（未串接官方 API）。"
      : "Copy LINE ID and search in LINE (no official API connected).",
    lineLastSend: zh ? "上次模擬發送：" : "Last simulated send: ",
    lineNoId: zh ? " 尚未填寫 LINE ID — 請先編輯客戶資料。" : " No LINE ID — edit customer first.",
    sendToLine: zh ? "傳送到 LINE（一鍵模擬）" : "Send to LINE (simulated)",
    sendToLineHint: zh
      ? "將複製建議追蹤文案、記錄發送時間並嘗試開啟 LINE App；在 LINE 搜尋貼上 ID 後傳訊。"
      : "Copies follow-up text, logs send time, and opens LINE app; paste ID in LINE search to message.",
    openLineSearch: zh ? "打開 LINE 並貼上此 ID 搜尋" : "Open LINE and paste this ID into search",
    noLineId: zh ? "— 未填寫 LINE ID" : "— No LINE ID",
    copyLineId: zh ? "複製 LINE ID" : "Copy LINE ID",
    openLineApp: zh ? "開啟 LINE App" : "Open LINE app",
    copyFollowUp: zh ? "複製追蹤訊息" : "Copy follow-up",
    sendHistory: zh ? "發送紀錄（模擬）" : "Send history (simulated)",
    noSendHistory: zh ? "尚無紀錄。按下「傳送到 LINE」後會寫入時間軸。" : "No entries yet. Use Send to LINE to log.",
    simulatedSend: zh ? "一鍵模擬發送" : "One-click simulated send",
    modeManual: zh ? "手動" : "Manual",
    modeAssisted: zh ? "輔助" : "Assisted",
    modeAuto: zh ? "自動" : "Auto",
    modeHintManual: zh ? "提醒與建議" : "Reminders & suggestions",
    modeHintAssisted: zh ? "草稿＋確認" : "Draft + confirm",
    modeHintAuto: zh ? "自動送出" : "Auto send",
    modeRadiogroup: zh ? "AI 追蹤發送模式" : "AI follow-up send mode",
    nothingToCopy: zh ? "沒有可複製的內容" : "Nothing to copy",
    noLineIdAlert: zh ? "尚未填寫 LINE ID" : "No LINE ID on file",
    copiedKind: (kind: string) => (zh ? `已複製${kind}` : `Copied: ${kind}`),
    followUpCopiedToast: zh
      ? "已複製追蹤訊息，請貼到 LINE。"
      : "Follow-up message copied. Paste into LINE.",
    noFollowUpToCopy: zh ? "No follow-up message to copy." : "No follow-up message to copy.",
    lineIdCopied: zh ? "已複製 LINE ID" : "LINE ID copied.",
    manualHint: zh
      ? "僅顯示提醒與建議文案，由您自行在外部管道聯絡客戶。"
      : "Shows reminders and suggested copy only; you contact the customer externally.",
    assistedHint: zh
      ? "系統產生草稿後，請確認內容再以模擬流程送出（尚未連接 LINE）。"
      : "Review the AI draft, then send via the simulated flow (LINE not connected).",
    autoHint: zh
      ? "符合追蹤排程時將自動送出（此為模擬）；上方卡片也可再次手動觸發演示。"
      : "Auto-send on schedule (simulated); you can trigger a demo again from the card above.",
    suggestedNotSent: zh ? "建議追蹤訊息（不會自動發送）" : "Suggested follow-up (not sent automatically)",
    copySuggested: zh ? "複製建議文案" : "Copy suggestion",
    aiDraftTitle: zh ? "AI 草稿（送出前請確認）" : "AI draft (confirm before send)",
    generateDraft: zh ? "產生 AI 草稿" : "Generate AI draft",
    copyDraft: zh ? "複製草稿" : "Copy draft",
    draftPlaceholder: zh ? "點「產生 AI 草稿」或自行輸入…" : "Generate a draft or type here…",
    confirmSimulatedSend: zh ? "確認並送出（模擬）" : "Confirm & send (simulated)",
    processing: zh ? "處理中…" : "Processing…",
    autoPreviewTitle: zh ? "將自動發送的訊息預覽（模擬）" : "Auto-send preview (simulated)",
    copyPreview: zh ? "複製預覽" : "Copy preview",
    simulateAutoAgain: zh ? "再次模擬自動發送" : "Simulate auto-send again",
    simulating: zh ? "模擬中…" : "Simulating…",
    lastSimulatedAt: zh ? "上次模擬發送時間：" : "Last simulated send: ",
    autoBanner: zh
      ? "系統已依「自動模式」模擬發送追蹤訊息（尚未連接 LINE）"
      : "Auto mode simulated a follow-up send (LINE not connected)",
    copyFollowUpTitle: zh ? "複製追蹤訊息" : "Copy follow-up message",
    copyFollowUpDesc: zh
      ? "若無法自動複製，請點下方按鈕或長按文字框選取複製。"
      : "Tap the button below or long-press the text to copy.",
    close: zh ? "關閉" : "Close",
    copied: zh ? "已複製" : "Copied",
    copiedExclaim: zh ? "已複製！" : "Copied!",
    nothingToSend: zh ? "沒有可送出的訊息內容。" : "No message to send.",
    confirmSimulated: zh
      ? "確認以模擬方式送出此訊息？（尚未連接真實 LINE）"
      : "Send this message in simulation? (LINE not connected)",
    simulatedSent: zh ? "已模擬送出追蹤訊息。" : "Follow-up simulated.",
    simulatedAutoSent: zh ? "已模擬自動發送追蹤訊息。" : "Auto follow-up simulated.",
    processingLine: zh ? "處理中…" : "Processing…",
    conversationsTitle: zh ? "對話紀錄" : "Conversation history",
    conversationsEmpty: "No conversations yet.",
    conversationsLoading: zh ? "載入中…" : "Loading…",
    directionInbound: zh ? "客戶" : "Inbound",
    directionOutbound: zh ? "系統" : "Outbound",
  };
}
