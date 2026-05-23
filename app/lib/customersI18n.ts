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
    title: zh ? "客戶資料庫" : "Customer CRM",
    count: (total: number, shown: number) =>
      zh ? `共 ${total} 筆 · 顯示 ${shown} 筆` : `${total} total · showing ${shown}`,
    backHome: zh ? "← 回到 LINE Work AI" : "← Back to LINE Work AI",
    searchTitle: zh ? "搜尋客戶" : "Search customers",
    searchPlaceholder: zh
      ? "搜尋姓名 / 公司 / 電話 / LINE 帳號 / 電子郵件"
      : "Search name / company / phone / LINE / email",
    lineId: zh ? "LINE 帳號" : "LINE ID",
    email: zh ? "電子郵件" : "Email",
    enterName: zh ? "請輸入客戶姓名" : "Please enter customer name",
    addSuccess: zh ? "新增成功" : "Customer added",
    confirmDelete: zh
      ? "確定將此客戶移至垃圾桶？"
      : "Move this customer to trash?",
    confirmRestore: zh ? "確定還原此客戶？" : "Restore this customer?",
    confirmPermanentDelete: zh
      ? "永久刪除後無法復原，確定要刪除嗎？"
      : "Permanently delete? This cannot be undone.",
    trash: zh ? "垃圾桶" : "Trash",
    exitTrash: zh ? "返回客戶列表" : "Back to customers",
    trashTitle: zh ? "垃圾桶" : "Trash",
    trashCount: (n: number) =>
      zh ? `共 ${n} 筆已刪除客戶` : `${n} deleted customer${n === 1 ? "" : "s"}`,
    restoreCustomer: zh ? "還原" : "Restore",
    permanentDelete: zh ? "永久刪除" : "Delete permanently",
    createdAtLabel: zh ? "建檔時間" : "Created",
    lastContactLabel: zh ? "最後聯絡時間" : "Last contact",
    deletedAtLabel: zh ? "刪除時間" : "Deleted",
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
    followUp: zh ? "客戶追蹤" : "Follow up",
    aiSend: zh ? "AI 發送" : "AI send",
    followUpReminder: zh ? "追蹤提醒" : "Follow-up",
    noExplicitDate: zh ? "無明確日期" : "No explicit date",
    note: zh ? "備註" : "Note",
    viewDetail: zh ? "查看詳情" : "View details",
    clickCardHint: zh ? "點擊「查看詳情」開啟完整客戶資料" : "Use “View details” for the full profile",
    openCustomerDetail: (name: string) =>
      zh ? `開啟 ${name || "客戶"} 詳情` : `Open ${name || "customer"} details`,
    deleteCustomer: zh ? "刪除客戶" : "Delete",
    addCustomer: zh ? "新增客戶" : "Add customer",
    addCustomerBtn: zh ? "＋ 新增客戶" : "+ Add customer",
    namePlaceholder: zh ? "客戶姓名" : "Customer name",
    companyPlaceholder: zh ? "公司名稱" : "Company name",
    phonePlaceholder: zh ? "電話" : "Phone",
    followUpTitle: (date: string) => (zh ? `追蹤：${date}` : `Follow-up: ${date}`),
    salesStatus: zh ? "客戶狀態" : "Customer status",
    filtersTitle: zh ? "客戶篩選" : "Customer filters",
    filterStatus: zh ? "狀態" : "Status",
    filterFollowUp: zh ? "追蹤日" : "Follow-up date",
    filterUrgency: zh ? "緊急度" : "Urgency",
    filterAll: zh ? "全部" : "All",
    filterFollowHasDate: zh ? "已排程" : "Scheduled",
    filterFollowNoDate: zh ? "未排程" : "Not scheduled",
    filterFollowOverdue: zh ? "逾期" : "Overdue",
    filterFollowToday: zh ? "今天" : "Today",
    filterFollowNext7: zh ? "未來 7 天" : "Next 7 days",
    filterUrgencyOverdueToday: zh ? "逾期／今日" : "Overdue / today",
    filterUrgencyWithin3: zh ? "3 天內" : "Within 3 days",
    filterUrgencyWithin7: zh ? "7 天內" : "Within 7 days",
    filterUrgencyLater: zh ? "7 天以上" : "7+ days",
    filterUrgencyCompleted: zh ? "已完成" : "Completed",
    filterUrgencyNone: zh ? "未排程" : "Not scheduled",
    openPipeline: zh ? "業務流程看板" : "Pipeline board",
    selectAll: zh ? "全選" : "Select all",
    selectAllShown: (n: number) => (zh ? `全選（顯示中 ${n} 筆）` : `Select all (${n} shown)`),
    selectedCount: (n: number) => (zh ? `已選擇 ${n} 筆` : `${n} selected`),
    batchDelete: zh ? "刪除" : "Delete",
    batchDeleteConfirmTitle: zh ? "確定要刪除這些客戶資料嗎？" : "Delete selected customers?",
    batchDeleteConfirmBody: zh
      ? "客戶將移至垃圾桶，可於垃圾桶還原。"
      : "Customers will move to trash. You can restore them from Trash.",
    cancel: zh ? "取消" : "Cancel",
    confirmBatchDelete: zh ? "確認刪除" : "Confirm delete",
    batchDeleteSuccess: (n: number) =>
      zh ? `已將 ${n} 筆客戶移至垃圾桶` : `Moved ${n} customer${n === 1 ? "" : "s"} to trash`,
    batchDeleting: zh ? "刪除中…" : "Deleting…",
  };
}

export function pipelineBoardCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    title: zh ? "業務流程看板" : "Sales pipeline board",
    subtitle: (n: number) =>
      zh ? `共 ${n} 位客戶` : `${n} customer${n === 1 ? "" : "s"}`,
    backCustomers: zh ? "← 客戶列表" : "← Customer list",
    backHome: zh ? "回首頁" : "Home",
    statsTotal: zh ? "客戶總數" : "Total customers",
    statsWon: zh ? "已成交" : "Won",
    statsLost: zh ? "無效客戶" : "Invalid",
    statsConversion: zh ? "成交率" : "Conversion rate",
    statsConversionHelp: zh
      ? "成交 ÷ (成交 + 流失)"
      : "Won ÷ (Won + Lost)",
    emptyColumn: zh ? "目前沒有客戶" : "No customers yet",
    moveTo: zh ? "移動到…" : "Move to…",
    updating: zh ? "更新中…" : "Updating…",
    updateFailed: zh ? "更新狀態失敗" : "Failed to update status",
    dragHint: zh
      ? "拖曳卡片到欄位即可更新狀態；手機亦可長按拖曳，或使用卡片上的下拉選單。"
      : "Drag cards between columns to update status. On mobile, long-press to drag or use the dropdown.",
    searchPlaceholder: zh ? "搜尋客戶、公司、備註…" : "Search name, company, notes…",
    filterAll: zh ? "全部欄位" : "All columns",
    columnCount: (n: number) => (zh ? `${n} 位` : `${n}`),
    columnAmount: zh ? "預估合計" : "Est. total",
    aiScore: zh ? "成交機率" : "Win score",
    priority: zh ? "優先" : "Priority",
    latestNote: zh ? "最新備註" : "Latest note",
    importantDate: zh ? "重要日期" : "Key date",
    noNote: zh ? "尚無備註" : "No notes yet",
    noImportantDate: zh ? "—" : "—",
    deleteCustomer: zh ? "刪除" : "Delete",
    confirmDelete: zh
      ? "確定將此客戶移至垃圾桶？"
      : "Move this customer to trash?",
    urgent: zh ? "緊急" : "Urgent",
    highPriority: zh ? "高優先" : "High priority",
    unnamed: zh ? "未命名客戶" : "Unnamed",
    followUpPrefix: zh ? "追蹤" : "Follow-up",
    estimatedShort: zh ? "預估" : "Est.",
    openCustomer: zh ? "查看" : "Open",
    collapseColumn: zh ? "收合欄位" : "Collapse column",
    expandColumn: zh ? "展開欄位" : "Expand column",
    createdAtLabel: zh ? "建檔時間" : "Created",
    lastContactLabel: zh ? "最後聯絡時間" : "Last contact",
  };
}

export type CustomerDetailCopy = ReturnType<typeof customerDetailCopy>;

export function customerDetailCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    customerList: zh ? "返回客戶列表" : "Back to Customers",
    sectionTimeline: zh ? "時間軸" : "Timeline",
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
    confirmDelete: zh
      ? "確定將此客戶移至垃圾桶？"
      : "Move this customer to trash?",
    followUpModeTitle: zh ? "AI 追蹤發送模式" : "AI follow-up send mode",
    lineNotConnected: zh ? "尚未連接真實 LINE，以下為模擬流程" : "LINE is not connected; flows below are simulated",
    syncing: zh ? "同步中…" : "Syncing…",
    sectionBasic: zh ? "基本資料" : "Basic info",
    sectionAi: zh ? "AI 分析" : "AI analysis",
    sectionFollow: zh ? "追蹤與回覆" : "Follow-up & replies",
    sectionMetrics: zh ? "指標與分析" : "Metrics & analysis",
    sectionFollowPanel: zh ? "追蹤與回覆" : "Follow-up & replies",
    sectionRecords: zh ? "記錄" : "Records",
    createdAt: zh ? "建檔時間" : "Created",
    updatedAt: zh ? "更新時間" : "Updated",
    lastContact: zh ? "最後聯絡時間" : "Last contact",
    fieldLabels: {
      customer_name: zh ? "客戶姓名" : "Customer name",
      company_name: zh ? "公司" : "Company",
      phone: zh ? "電話" : "Phone",
      line_id: zh ? "LINE 帳號" : "LINE",
      email: zh ? "電子郵件" : "Email",
      customer_status: zh ? "客戶狀態" : "Customer status",
      status: zh ? "客戶狀態" : "Customer status",
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
      noExplicitFollowUpDate: zh ? "無明確日期" : "No explicit date",
      todo: zh ? "待辦事項" : "Todo",
      follow_up: zh ? "追蹤訊息" : "Follow-up message",
      reply_suggestion: zh ? "專業回覆" : "Reply suggestion",
    },
    lineQuickContact: zh ? "快速聯絡" : "Quick contact",
    lineQuickLead: zh
      ? "複製 LINE 帳號後在 LINE 內搜尋加好友（未串接官方 API）。"
      : "Copy LINE ID and search in LINE (no official API connected).",
    lineLastSend: zh ? "上次模擬發送：" : "Last simulated send: ",
    lineNoId: zh ? " 尚未填寫 LINE 帳號 — 請先編輯客戶資料。" : " No LINE ID — edit customer first.",
    sendToLine: zh ? "傳送到 LINE" : "Send to LINE",
    sendToLineHint: zh
      ? "透過 LINE Messaging API 推送至已綁定的官方帳號使用者（需設定 Channel Access Token）。"
      : "Pushes to the bound LINE user via Messaging API (Channel Access Token required).",
    linePushSuccess: zh ? "已透過 LINE 傳送訊息" : "Message sent via LINE",
    linePushFailed: zh ? "LINE 傳送失敗" : "LINE send failed",
    lineUserRequiredForSend: zh
      ? "請先綁定 LINE 官方帳號，或點選下方帳號卡片"
      : "Bind a LINE account first, or select an account card below",
    openLineSearch: zh ? "打開 LINE 並貼上此 ID 搜尋" : "Open LINE and paste this ID into search",
    noLineId: zh ? "尚未填 LINE 帳號" : "No LINE ID on file",
    aiLineReplyTitle: zh ? "AI 建議 LINE 回覆" : "AI-suggested LINE reply",
    aiLineReplyLead: zh
      ? "依客戶姓名、公司、狀態、需求、備註、成交機率與最後聯絡時間產生追蹤文案。"
      : "Draft based on name, company, status, needs, notes, deal probability, and last contact.",
    copyAiLineReply: zh ? "複製 AI 回覆訊息" : "Copy AI reply",
    copyAiLineReplyTitle: zh ? "複製 AI 回覆訊息" : "Copy AI reply message",
    copyAiLineReplyDesc: zh
      ? "複製後會更新「最後聯絡時間」。若無法自動複製，請點下方按鈕。"
      : "Copying also updates last contact time. Tap the button below if auto-copy fails.",
    aiLineReplyCopiedToast: zh ? "已複製 AI 回覆訊息" : "AI reply copied",
    copyLineId: zh ? "複製 LINE 帳號" : "Copy LINE ID",
    openLineAddFriend: zh ? "開啟 LINE 加好友" : "Open LINE add friend",
    openLineAddFriendQrHint: zh
      ? "桌機瀏覽器會顯示 QR Code，請用手機 LINE 掃描加入好友。"
      : "On desktop browsers you will see a QR code—scan it with LINE on your phone to add this friend.",
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
    noLineIdAlert: zh ? "尚未填寫 LINE 帳號" : "No LINE ID on file",
    tapToCopy: zh ? "點此複製" : "Tap to Copy",
    copyKindTitle: (kind: string) => (zh ? `複製${kind}` : `Copy ${kind}`),
    copyGenericDesc: zh ? "請點下方按鈕複製，再貼到需要的位置。" : "Tap the button to copy, then paste where you need it.",
    copiedKind: (kind: string) => (zh ? `已複製${kind}` : `Copied: ${kind}`),
    followUpCopiedToast: zh
      ? "已複製追蹤訊息，請貼到 LINE。"
      : "Follow-up message copied. Paste into LINE.",
    noFollowUpToCopy: zh ? "沒有可複製的追蹤訊息。" : "No follow-up message to copy.",
    lineIdCopied: zh ? "已複製 LINE 帳號" : "LINE ID copied.",
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
    boundLineAccountsTitle: zh ? "已綁定 LINE 帳號" : "Bound LINE accounts",
    boundLineCount: (n: number) =>
      zh ? `已綁定 ${n} 個 LINE 帳號` : `${n} bound LINE account${n === 1 ? "" : "s"}`,
    primaryLineAccount: zh ? "主要 LINE" : "Primary LINE",
    lineIdRequiredForChat: zh ? "請先填寫客戶 LINE ID" : "Add customer LINE ID first",
    customerLineIdLabel: zh ? "客戶 LINE ID" : "Customer LINE ID",
    customerLineIdPlaceholder: zh ? "例如 lin19790724" : "e.g. lin19790724",
    saveLineId: zh ? "儲存 LINE ID" : "Save LINE ID",
    lineIdSavedToast: zh ? "已儲存 LINE ID" : "LINE ID saved",
    noBoundLineAccounts: zh
      ? "尚無綁定的 LINE 官方帳號。客戶在 LINE 傳送「綁定」後會顯示於此。"
      : "No bound LINE accounts yet. They appear after the customer sends「綁定」in LINE.",
    lineDisplayNameLabel: zh ? "顯示名稱" : "Display name",
    lineUserIdLabel: zh ? "LINE 使用者 ID" : "LINE user ID",
    lineBoundAtLabel: zh ? "綁定時間" : "Bound at",
    conversationsFiltered: (name: string) =>
      zh ? `對話紀錄 · ${name}` : `Conversations · ${name}`,
    conversationsTitle: zh ? "對話紀錄" : "Conversation history",
    conversationsEmpty: zh ? "尚無對話紀錄。" : "No conversations yet.",
    conversationsLoading: zh ? "載入中…" : "Loading…",
    directionInbound: zh ? "客戶" : "Inbound",
    directionOutbound: zh ? "系統" : "Outbound",
    conversationDeleteAria: zh ? "刪除這筆對話" : "Delete this message",
    conversationDeleteConfirm: zh ? "確定要刪除這筆對話？" : "Delete this message?",
    conversationClearAll: zh ? "清空全部對話" : "Clear all conversations",
    conversationClearAllConfirm: zh
      ? "確定要清空此客戶的全部對話？"
      : "Delete every conversation for this customer?",
    conversationDeleting: zh ? "刪除中…" : "Deleting…",
  };
}
