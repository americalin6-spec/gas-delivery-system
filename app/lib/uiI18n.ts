import type { AppLang } from "./appLang";

/** UI-only translation for values stored in CRM / analysis (does not change DB). */
export function translateDisplayValue(value: string | null | undefined, lang: AppLang): string {
  if (value == null) return "—";
  const raw = String(value).trim();
  if (!raw || raw === "--" || raw === "-") return raw || "—";
  if (lang === "zh") return raw;

  const map: Record<string, string> = {
    未提供: "Not provided",
    近期: "Soon",
    高: "High",
    中: "Medium",
    低: "Low",
    "A級客戶": "A-Level Client",
    "B級客戶": "B-Level Client",
    "C級客戶": "C-Level Client",
    "積極、有興趣": "Interested and engaged",
    "還在評估": "Still evaluating",
    "立即提供提案與報價": "Send proposal and quotation now",
    "持續追蹤": "Keep following up",
    "安排會議": "Schedule a meeting",
    "三天後追蹤": "Follow up in 3 days",
    "明天追蹤": "Follow up tomorrow",
    "下週聯絡": "Contact again next week",
    "品牌影片、高級感、快速交付": "Brand video, premium look, fast delivery",
    "您好，我們會先提供完整企劃與報價給您。": "We will prepare a full plan and quotation for you.",
    未知: "Unknown",
    手動: "Manual",
    輔助發送: "Assisted",
    自動發送: "Auto",
    逾期: "Overdue",
    即將到期: "Due soon",
    已排程: "Scheduled",
  };

  return map[raw] ?? raw;
}

export function sharedUiCopy(lang: AppLang) {
  const zh = lang === "zh";
  return {
    backHome: zh ? "← 回到 LINE Work AI" : "← Back to LINE Work AI",
    langToggle: zh ? "English" : "中文",
    testNotification: zh ? "測試通知" : "Test Notification",
    notProvided: zh ? "未提供" : "Not provided",
    unnamed: zh ? "未命名客戶" : "Unnamed customer",
    unknown: zh ? "未知" : "Unknown",
    loading: zh ? "載入中…" : "Loading…",
    saving: zh ? "儲存中…" : "Saving…",
    close: zh ? "關閉" : "Close",
    copied: zh ? "已複製" : "Copied",
    copiedExclaim: zh ? "已複製！" : "Copied!",
    tapToCopy: zh ? "點此複製" : "Tap to Copy",
    copyFallbackTitle: zh ? "複製內容" : "Copy message",
    copyFallbackDesc: zh
      ? "此裝置無法自動複製，請點下方按鈕後貼到 LINE。"
      : "Automatic copy is not available on this device. Tap the button below, then paste into LINE.",
    copyFailed: zh ? "複製失敗，請手動複製" : "Copy failed — please copy manually",
    comingSoon: zh ? "功能準備中" : "Coming soon",
  };
}

export function homePageCopy(lang: AppLang) {
  const zh = lang === "zh";
  const s = sharedUiCopy(lang);
  return {
    ...s,
    landingTitle: zh ? "LINE AI 成交助手" : "LINE AI Sales Assistant",
    landingSubtitle: zh
      ? "把 LINE 對話變成客戶追蹤、成交機率與 AI 回覆建議"
      : "Turn LINE chats into follow-ups, deal probability, and AI reply suggestions",
    landingFeature1Title: zh ? "AI 分析 LINE 對話" : "AI LINE chat analysis",
    landingFeature1Desc: zh
      ? "貼上對話即可擷取客戶資料、成交洞察與專業回覆建議。"
      : "Paste chats to extract CRM fields, deal insights, and reply drafts.",
    landingFeature2Title: zh ? "今日追蹤工作台" : "Today's follow-up desk",
    landingFeature2Desc: zh
      ? "今日待追蹤、逾期、高成交率與新客戶，一站掌握。"
      : "Due today, overdue, hot leads, and new clients in one place.",
    landingFeature3Title: zh ? "行事曆與瀏覽器通知" : "Calendar & browser alerts",
    landingFeature3Desc: zh
      ? "月曆排程追蹤日，重要提醒推送到瀏覽器（不會自動發 LINE）。"
      : "Monthly follow-up calendar plus browser reminders (no auto LINE).",
    landingCta: zh ? "免費試用" : "Try free",
    tagline: zh
      ? "把 LINE 對話變成成交率、待辦、漏單提醒與專業回覆。"
      : "Turn LINE conversations into sales probability, tasks, deal alerts, and professional replies.",
    workspace: zh ? "儀表板" : "Workspace",
    pasteLine: zh ? "貼上 LINE 對話" : "Paste LINE Conversation",
    pasteLead: zh
      ? "貼上對話後開始分析：自動擷取客戶資料填入上方欄位（可手動修改），並產出成交洞察。"
      : "After pasting, run analysis to extract CRM fields above (editable) plus deal insights.",
    linePlaceholder: zh
      ? "客戶：您好，我們想了解貴公司的方案與報價…"
      : "Client: We want a brand video...",
    clearText: zh ? "清除文字" : "Clear Text",
    analyzing: zh ? "分析中..." : "Analyzing...",
    startAnalysis: zh ? "開始 AI 分析" : "Start AI Analysis",
    saveToCrm: zh ? "存到 CRM" : "Save to CRM",
    savedToCrm: zh ? "已存到 CRM" : "Saved to CRM",
    pasteRequired: zh ? "請貼上 LINE 對話" : "Please paste LINE conversation",
    analysisResults: zh ? "分析結果" : "Analysis results",
    dealProbability: zh ? "成交機率" : "Deal Probability",
    customerLevel: zh ? "客戶等級" : "Customer Level",
    leakRisk: zh ? "漏單風險" : "Leak Risk",
    estimatedAmount: zh ? "預估金額" : "Estimated Amount",
    customerNeeds: zh ? "客戶需求" : "Customer Needs",
    importantDate: zh ? "重要日期" : "Important Date",
    customerEmotion: zh ? "客戶情緒" : "Customer Emotion",
    nextStep: zh ? "下一步建議" : "Next Step",
    todo: zh ? "待辦事項" : "Todo",
    replySuggestion: zh ? "專業回覆" : "Reply Suggestion",
    followUp: zh ? "客戶追蹤" : "Follow Up",
    menuNew: zh ? "新分析" : "New Analysis",
    menuCustomers: zh ? "客戶列表" : "Customers",
    menuTasks: zh ? "待辦事項" : "Tasks",
    menuAlerts: zh ? "通知中心" : "Alerts",
    menuCalendar: zh ? "行事曆" : "Calendar",
    menuQuotes: zh ? "報價追蹤" : "Quotes",
    menuReplies: zh ? "AI 回覆庫" : "AI Replies",
    remindersTitle: zh ? "近期追蹤提醒" : "Upcoming follow-ups",
    remindersEmpty: zh ? "目前沒有 14 天內的追蹤排程。" : "No follow-ups scheduled in the next 14 days.",
    calendarTitle: zh ? "提醒行事曆" : "Reminder calendar",
    calendarLead: zh ? "依追蹤日期顯示客戶，點擊進入詳情。" : "Customers by follow-up date — tap to open detail.",
    calendarEmpty: zh ? "尚無追蹤排程。" : "No scheduled follow-ups.",
    viewCalendar: zh ? "查看行事曆" : "Open calendar",
    homeAlertsTitle: zh ? "通知中心" : "Notifications",
    homeAlertsLead: zh ? "今日追蹤、逾期、高成交率、久未聯絡。" : "Due today, overdue, high deals, stale contact.",
    viewAlerts: zh ? "查看全部通知" : "View all alerts",
    suggestedLabel: zh ? "建議追蹤訊息（不會自動發送）" : "Suggested message (not sent automatically)",
    copy: zh ? "複製" : "Copy",
    copyFollowUpTitle: zh ? "複製追蹤訊息" : "Copy follow-up message",
    copyFollowUpDesc: zh
      ? "若無法自動複製，請點下方按鈕或長按文字框選取複製。"
      : "Tap the button below or long-press the text to copy.",
    extractedTitle: zh ? "擷取的客戶資料" : "Extracted customer profile",
    extractedHint: zh
      ? "已套用至上方的 CRM 表單；請確認後再存到 CRM。"
      : "Applied to the CRM fields above; review before saving.",
    extractedName: zh ? "客戶姓名" : "Customer name",
    extractedCompany: zh ? "公司" : "Company",
    extractedPhone: zh ? "電話" : "Phone",
    extractedNeeds: zh ? "客戶需求" : "Customer needs",
    notDetected: zh ? "— 未偵測" : "— Not detected",
    nameNotProvided: zh ? "未提供姓名" : "Name not provided",
    fieldCustomerName: zh ? "客戶姓名" : "Customer Name",
    fieldCompanyName: zh ? "公司名稱" : "Company Name",
    fieldPhone: zh ? "電話" : "Phone",
    fieldLineId: zh ? "LINE 帳號" : "LINE ID",
    fieldEmail: zh ? "電子郵件" : "Email",
    fieldNote: zh ? "客戶備註" : "Customer Note",
  };
}

export function tasksPageCopy(lang: AppLang) {
  const zh = lang === "zh";
  const s = sharedUiCopy(lang);
  return {
    ...s,
    title: zh ? "待辦追蹤" : "Task follow-ups",
    subtitle: (count: number, loading: boolean) =>
      zh
        ? `共 ${count} 筆待追蹤客戶${loading ? " · 載入中…" : ""}`
        : `${count} customers to follow up${loading ? " · Loading…" : ""}`,
    empty: zh
      ? "目前沒有待辦客戶。請先在首頁分析並存到 CRM，或確認客戶有待辦、下一步或追蹤訊息。"
      : "No follow-up tasks yet. Analyze on the home page and save to CRM, or add todo / next step / follow-up on a customer.",
    company: zh ? "公司" : "Company",
    phone: zh ? "電話" : "Phone",
    todo: zh ? "待辦事項" : "Todo",
    nextStep: zh ? "下一步" : "Next step",
    followUp: zh ? "客戶追蹤" : "Follow-up message",
    copyFollowUp: zh ? "複製追蹤訊息" : "Copy follow-up",
    copiedFollowUp: zh ? "已複製追蹤訊息" : "Follow-up message copied",
    markedDone: zh ? "已標記追蹤完成" : "Marked as followed up",
    tracked: zh ? "已追蹤" : "Followed up",
  };
}
