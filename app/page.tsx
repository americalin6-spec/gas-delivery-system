"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { supabase } from "../supabase";
import {
  buildSuggestedSalesFollowUp,
  computeHighPotentialFollowUpDate,
  formatFollowUpDateDisplay,
  formatLocalYmd,
  getFollowUpBadge,
  isHighDealProbability,
  normalizeFollowUpDateValue,
  type FollowUpBadge,
} from "./lib/followUpReminders";
import { useViewportWidth } from "./hooks/useViewportWidth";
import { useAppLang } from "./hooks/useAppLang";
import { useCopyWithFallback } from "./hooks/useCopyWithFallback";
import { homePageCopy, translateDisplayValue } from "./lib/uiI18n";
import type { AppLang } from "./lib/appLang";
import {
  customerNameForCrm,
  extractCustomerFromLineChat,
  resolveCustomerNameForForm,
  type ExtractedCustomerProfile,
} from "./lib/extractCustomerFromLineChat";
import { HomeAlertsSection, HomeCalendarSection } from "./components/HomeCalendarAlerts";
import { TodayFollowUpWorkspace } from "./components/TodayFollowUpWorkspace";
import { TextInputWithVoice } from "./components/VoiceInputButton";
import { HomeLandingHero } from "./components/HomeLandingHero";
import {
  WORKSPACE_CUSTOMER_SELECT,
  type WorkspaceCustomerRow,
} from "./lib/followUpWorkspace";
import {
  CALENDAR_CUSTOMER_SELECT,
  type ReminderCustomerRow,
} from "./lib/calendarReminders";

const HOME_MOBILE_MAX_WIDTH = 1024;

function extractAmount(text: string, lang: string) {
  const patterns = [
    /NT\$?\s?[\d,]+/i,
    /TWD\s?[\d,]+/i,
    /台幣\s?[\d,]+/i,
    /新台幣\s?[\d,]+/i,
    /[\d,]+\s?萬/,
    /USD\s?\$?[\d,]+/i,
    /US\$[\d,]+/i,
    /\$[\d,]+/i,
    /[\d,]+\s?dollars/i,
    /¥[\d,]+/i,
    /JPY\s?[\d,]+/i,
    /[\d,]+\s?yen/i,
    /€[\d,]+/i,
    /EUR\s?[\d,]+/i,
    /£[\d,]+/i,
    /GBP\s?[\d,]+/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return lang === "zh" ? "未提供" : "Not provided";
}

function calculateDealProbability(text: string, lang: string) {
  const t = text.toLowerCase();
  let score = 0;

  const highSignals = [
    "預算", "報價", "兩週", "月底", "下個月", "一定要", "需要", "想做", "麻煩", "急", "合作", "簽約",
    "budget", "quotation", "proposal", "within", "need", "urgent", "please send", "sounds good", "contract",
  ];

  const lowSignals = [
    "先問問", "只是看看", "還不確定", "沒有預算", "先了解", "再看看", "比較一下",
    "just asking", "just looking", "not sure", "no budget", "exploring", "compare",
  ];

  highSignals.forEach((w) => {
    if (t.includes(w.toLowerCase())) score += 1;
  });

  lowSignals.forEach((w) => {
    if (t.includes(w.toLowerCase())) score -= 2;
  });

  if (score >= 3) return lang === "zh" ? "高" : "High";
  if (score >= 1) return lang === "zh" ? "中" : "Medium";
  return lang === "zh" ? "低" : "Low";
}

const emptyAnalysis = {
  dealProbability: "--",
  customerLevel: "--",
  leakRisk: "--",
  estimatedAmount: "--",
  customerNeed: "--",
  importantDate: "--",
  customerEmotion: "--",
  nextStep: "--",
  todo: "--",
  replySuggestion: "--",
  followUp: "--",
};

type DashboardReminder = {
  id: string | number;
  customer_name?: string | null;
  company_name?: string | null;
  follow_up_date?: string | null;
  customer_need?: string | null;
  next_step?: string | null;
  follow_up?: string | null;
};

function followUpBadgeLabel(badge: FollowUpBadge, lang: string): string {
  const zh: Record<FollowUpBadge, string> = {
    none: "",
    overdue: "逾期",
    soon: "即將到期",
    upcoming: "已排程",
  };
  const en: Record<FollowUpBadge, string> = {
    none: "",
    overdue: "Overdue",
    soon: "Due soon",
    upcoming: "Scheduled",
  };
  return lang === "zh" ? zh[badge] : en[badge];
}

function followUpBadgeColors(badge: FollowUpBadge): { bg: string; color: string; border: string } {
  switch (badge) {
    case "overdue":
      return {
        bg: "rgba(239,68,68,0.22)",
        color: "#fecaca",
        border: "rgba(248,113,113,0.45)",
      };
    case "soon":
      return {
        bg: "rgba(245,158,11,0.22)",
        color: "#fde68a",
        border: "rgba(251,191,36,0.45)",
      };
    case "upcoming":
      return {
        bg: "rgba(59,130,246,0.2)",
        color: "#bfdbfe",
        border: "rgba(96,165,250,0.45)",
      };
    default:
      return { bg: "transparent", color: "#fff", border: "transparent" };
  }
}

export default function Home() {
 
  const router = useRouter();
  const centerRef = useRef<HTMLElement>(null);

  const viewportWidth = useViewportWidth();
  const isMobile = viewportWidth === null || viewportWidth < HOME_MOBILE_MAX_WIDTH;
  const { copyWithFallback, fallbackModal: copyFallbackModal } = useCopyWithFallback(isMobile);

  const [text, setText] = useState("");
  const { lang, toggleLang } = useAppLang();
  const ui = homePageCopy(lang);

  function handleTestNotification() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      new Notification("CRM 測試通知", {
        body: "瀏覽器通知正常運作",
      });
    } catch {
      /* browser may block without permission */
    }
  }
  const displayValue = (value: string) => translateDisplayValue(value === "--" ? "" : value, lang);
  const [loading, setLoading] = useState(false);
  const [savingCrm, setSavingCrm] = useState(false);
  const [activeMenu, setActiveMenu] = useState(0);

  const [customerName, setCustomerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [lineId, setLineId] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const [analysis, setAnalysis] = useState(emptyAnalysis);
  const [extractedPreview, setExtractedPreview] = useState<ExtractedCustomerProfile | null>(null);
  const [followUpReminders, setFollowUpReminders] = useState<DashboardReminder[]>([]);
  const [calendarRows, setCalendarRows] = useState<ReminderCustomerRow[]>([]);
  const [workspaceRows, setWorkspaceRows] = useState<WorkspaceCustomerRow[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const loadCalendarRows = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("customers").select(CALENDAR_CUSTOMER_SELECT).limit(200);
      if (error) {
        setCalendarRows([]);
        return;
      }
      setCalendarRows((data ?? []) as ReminderCustomerRow[]);
    } catch {
      setCalendarRows([]);
    }
  }, []);

  const loadWorkspaceRows = useCallback(async () => {
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select(WORKSPACE_CUSTOMER_SELECT)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        setWorkspaceRows([]);
        setWorkspaceError(error.message);
      } else {
        setWorkspaceRows((data ?? []) as WorkspaceCustomerRow[]);
      }
    } catch {
      setWorkspaceRows([]);
      setWorkspaceError("load failed");
    }
    setWorkspaceLoading(false);
  }, []);

  const loadFollowUpReminders = useCallback(async () => {
    try {
      const end = new Date();
      end.setDate(end.getDate() + 14);
      const endStr = formatLocalYmd(end);

      const { data, error } = await supabase
        .from("customers")
        .select("id, customer_name, company_name, follow_up_date, customer_need, next_step, follow_up")
        .lte("follow_up_date", endStr)
        .order("follow_up_date", { ascending: true })
        .limit(40);

      if (error) {
        setFollowUpReminders([]);
        return;
      }

      const processed: DashboardReminder[] = [];
      for (const row of data ?? []) {
        if (row == null || row.id === undefined || row.id === null || String(row.id).length === 0) {
          continue;
        }
        const fd = normalizeFollowUpDateValue(row.follow_up_date);
        if (!fd || fd > endStr) continue;
        processed.push({ ...(row as DashboardReminder), follow_up_date: fd });
        if (processed.length >= 15) break;
      }

      setFollowUpReminders(processed);
    } catch {
      setFollowUpReminders([]);
    }
  }, []);

  useEffect(() => {
    void loadFollowUpReminders();
    void loadCalendarRows();
    void loadWorkspaceRows();
  }, [loadFollowUpReminders, loadCalendarRows, loadWorkspaceRows]);

  function scrollToApp() {
    centerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetAnalysisForm() {
    setText("");
    setCustomerName("");
    setCompanyName("");
    setPhone("");
    setLineId("");
    setEmail("");
    setNote("");
    setAnalysis(emptyAnalysis);
    setExtractedPreview(null);
    setActiveMenu(0);
    scrollToApp();
  }

  function handleMenuClick(index: number) {
    setActiveMenu(index);

    if (index === 0) {
      router.push("/");
      resetAnalysisForm();
      return;
    }

    if (index === 1) {
      router.push("/customers");
      return;
    }

    if (index === 2) {
      router.push("/tasks");
      return;
    }

    if (index === 3) {
      router.push("/calendar");
      return;
    }

    if (index === 4) {
      router.push("/alerts");
      return;
    }

    alert(ui.comingSoon);
  }

  async function saveToCrm() {
    setSavingCrm(true);

    const dealProb = analysis.dealProbability === "--" ? null : analysis.dealProbability;
    const insertRow: Record<string, string | null> = {
      customer_name: customerNameForCrm(customerName, lang),
      company_name: companyName.trim() || null,
      phone: phone.trim() || null,
      line_id: lineId.trim() || null,
      email: email.trim() || null,
      note: note.trim() || null,
      customer_need: analysis.customerNeed === "--" ? null : analysis.customerNeed,
      important_date: analysis.importantDate === "--" ? null : analysis.importantDate,
      customer_emotion: analysis.customerEmotion === "--" ? null : analysis.customerEmotion,
      next_step: analysis.nextStep === "--" ? null : analysis.nextStep,
      todo: analysis.todo === "--" ? null : analysis.todo,
      reply_suggestion: analysis.replySuggestion === "--" ? null : analysis.replySuggestion,
      follow_up: analysis.followUp === "--" ? null : analysis.followUp,
      success_rate: dealProb,
      customer_level: analysis.customerLevel === "--" ? null : analysis.customerLevel,
      churn_risk: analysis.leakRisk === "--" ? null : analysis.leakRisk,
      estimated_amount: analysis.estimatedAmount === "--" ? null : analysis.estimatedAmount,
      follow_up_mode: "manual",
    };

    if (isHighDealProbability(dealProb)) {
      insertRow.follow_up_date = computeHighPotentialFollowUpDate();
    }

    const { error } = await supabase.from("customers").insert([insertRow]);

    setSavingCrm(false);

    if (error) {
      alert(JSON.stringify(error, null, 2));
      return;
    }

    void loadFollowUpReminders();
    void loadWorkspaceRows();

    alert(ui.savedToCrm);
    setCustomerName("");
    setCompanyName("");
    setPhone("");
    setLineId("");
    setEmail("");
    setNote("");
    setText("");
    setAnalysis(emptyAnalysis);
    setExtractedPreview(null);
  }

  async function analyze() {
    if (!text.trim()) {
      alert(ui.pasteRequired);
      return;
    }

    setLoading(true);

    setCustomerName("");
    setCompanyName("");
    setPhone("");
    setLineId("");
    setEmail("");

    const probability = calculateDealProbability(text, lang);
    const amount = extractAmount(text, lang);
    const lowerText = text.toLowerCase();

    const finalData =
      lang === "zh"
        ? {
            dealProbability: probability,
            customerLevel: probability === "高" ? "A級客戶" : probability === "中" ? "B級客戶" : "C級客戶",
            leakRisk: probability === "低" ? "高" : "低",
            estimatedAmount: amount,
            customerNeed: "品牌影片、高級感、快速交付",
            importantDate: text.includes("兩週") || text.includes("月底") || text.includes("下個月") ? "近期" : "未提供",
            customerEmotion: probability === "高" ? "積極、有興趣" : "還在評估",
            nextStep: probability === "高" ? "立即提供提案與報價" : "持續追蹤",
            todo: probability === "高" ? "安排會議" : "三天後追蹤",
            replySuggestion: "您好，我們會先提供完整企劃與報價給您。",
            followUp: probability === "高" ? "明天追蹤" : "下週聯絡",
          }
        : {
            dealProbability: probability,
            customerLevel: probability === "High" ? "A-Level Client" : probability === "Medium" ? "B-Level Client" : "C-Level Client",
            leakRisk: probability === "Low" ? "High" : "Low",
            estimatedAmount: amount,
            customerNeed: "Premium brand video, cinematic style, fast delivery",
            importantDate:
              lowerText.includes("two weeks") || lowerText.includes("next month") || lowerText.includes("urgent")
                ? "Soon"
                : "Not provided",
            customerEmotion: probability === "High" ? "Interested and responsive" : "Still evaluating",
            nextStep: probability === "High" ? "Send proposal and quotation" : "Continue following up",
            todo: probability === "High" ? "Schedule meeting" : "Follow up in 3 days",
            replySuggestion: "We will prepare a proposal and quotation for you shortly.",
            followUp: probability === "High" ? "Follow up tomorrow" : "Contact again next week",
          };

    const extracted = extractCustomerFromLineChat(text, lang);
    const formCustomerName = resolveCustomerNameForForm(extracted.customer_name, lang);

    setExtractedPreview({
      ...extracted,
      customer_name: formCustomerName,
    });

    setCustomerName(formCustomerName);
    setCompanyName(extracted.company_name);
    setPhone(extracted.phone);
    setLineId(extracted.line_id);
    setEmail(extracted.email);

    const mergedFinal = {
      ...finalData,
      customerNeed: extracted.customer_need.trim() || finalData.customerNeed,
    };

    setAnalysis(mergedFinal);

    try {
      await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_text: text,
          deal_probability: finalData.dealProbability,
          customer_level: finalData.customerLevel,
          leak_risk: finalData.leakRisk,
          estimated_amount: finalData.estimatedAmount,
          customer_need: mergedFinal.customerNeed,
          important_date: finalData.importantDate,
          customer_emotion: finalData.customerEmotion,
          next_step: finalData.nextStep,
          todo: finalData.todo,
          reply_suggestion: finalData.replySuggestion,
          follow_up: finalData.followUp,
        }),
      });
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  }

  if (isMobile) {
    const full: CSSProperties = {
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      boxSizing: "border-box",
    };
    const textFlow: CSSProperties = {
      whiteSpace: "normal",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
    };
    const block = (extra?: CSSProperties): CSSProperties => ({ ...full, ...textFlow, ...extra });
    const mb = full;
    const mt = textFlow;

    const menuItems = [
      ui.menuNew,
      ui.menuCustomers,
      ui.menuTasks,
      ui.menuCalendar,
      ui.menuAlerts,
      ui.menuQuotes,
      ui.menuReplies,
    ];

    const menuBtn = (active: boolean): CSSProperties => ({
      ...block(),
      flex: "1 1 calc(50% - 4px)",
      minWidth: 0,
      padding: "13px 10px",
      borderRadius: 12,
      border: "none",
      cursor: "pointer",
      fontSize: 15,
      textAlign: "center",
      color: "white",
      background: active ? "#22c55e" : "rgba(255,255,255,0.12)",
    });

    const inputStyle: CSSProperties = {
      ...block(),
      padding: 15,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.08)",
      color: "white",
      fontSize: 17,
    };

    const statCard: CSSProperties = {
      ...block(),
      background: "#20334d",
      borderRadius: 16,
      padding: 16,
    };

    const resultBox: CSSProperties = {
      ...block(),
      background: "#203f4a",
      borderRadius: 16,
      padding: 18,
    };

    const analysisFields: { title: string; value: string }[] = [
      { title: ui.customerNeeds, value: displayValue(analysis.customerNeed) },
      { title: ui.importantDate, value: displayValue(analysis.importantDate) },
      { title: ui.customerEmotion, value: displayValue(analysis.customerEmotion) },
      { title: ui.nextStep, value: displayValue(analysis.nextStep) },
      { title: ui.todo, value: displayValue(analysis.todo) },
      { title: ui.replySuggestion, value: displayValue(analysis.replySuggestion) },
      { title: ui.followUp, value: displayValue(analysis.followUp) },
    ];

    return (
      <>
        {copyFallbackModal}
        <main
          style={{
            ...block(),
            minHeight: "100vh",
            overflowX: "hidden",
            background: "linear-gradient(90deg,#06192f,#003c42)",
            padding: "16px 16px max(24px, env(safe-area-inset-bottom))",
            color: "white",
            fontFamily:
              'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <HomeLandingHero lang={lang} isMobile onStart={scrollToApp} />

          <header style={{ ...block(), display: "flex", flexDirection: "column", gap: 12 }}>
            <h1 style={{ ...block(), margin: 0, fontSize: 32 }}>LINE Work AI</h1>
            <p style={{ ...block(), margin: 0, opacity: 0.85, fontSize: 16, lineHeight: 1.55 }}>
              {ui.tagline}
            </p>
            <div
              style={{
                ...block(),
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                maxWidth: "100%",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                style={{
                  ...block(),
                  flex: "1 1 140px",
                  minWidth: 0,
                  maxWidth: "100%",
                  padding: "14px 12px",
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  background: "rgba(255,255,255,0.14)",
                  color: "white",
                }}
                onClick={toggleLang}
              >
                {ui.langToggle}
              </button>
              <button
                type="button"
                style={{
                  ...block(),
                  flex: "1 1 140px",
                  minWidth: 0,
                  maxWidth: "100%",
                  padding: "14px 12px",
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 16,
                  background: "rgba(255,255,255,0.14)",
                  color: "white",
                }}
                onClick={handleTestNotification}
              >
                {ui.testNotification}
              </button>
            </div>
          </header>

          <TodayFollowUpWorkspace
            rows={workspaceRows}
            lang={lang}
            isMobile
            loading={workspaceLoading}
            loadError={workspaceError}
            onRefresh={() => void loadWorkspaceRows()}
            copyWithFallback={copyWithFallback}
          />

          <section style={{ ...block(), background: "#132846", borderRadius: 16, padding: 18 }}>
            <h2 style={{ ...block(), margin: "0 0 14px", fontSize: 22 }}>{ui.workspace}</h2>
            <div style={{ ...block(), display: "flex", flexWrap: "wrap", gap: 8 }}>
              {menuItems.map((item, i) => (
                <button key={i} type="button" style={menuBtn(activeMenu === i)} onClick={() => handleMenuClick(i)}>
                  {item}
                </button>
              ))}
            </div>
          </section>

          <FollowUpRemindersSection
            reminders={followUpReminders}
            lang={lang}
            variant="mobile"
            mb={mb}
            mt={mt}
            copyWithFallback={copyWithFallback}
          />

          <HomeCalendarSection customers={calendarRows} lang={lang} isMobile block={block()} />
          <HomeAlertsSection rows={calendarRows} lang={lang} isMobile block={block()} />

          <section
            ref={centerRef}
            style={{
              ...block(),
              background: "#173653",
              borderRadius: 20,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <h2 style={{ ...block(), margin: 0, fontSize: 22 }}>{ui.pasteLine}</h2>
            <p style={{ ...block(), margin: 0, fontSize: 16, lineHeight: 1.55 }}>
              {ui.pasteLead}
            </p>

            <div style={{ ...block(), display: "flex", flexDirection: "column", gap: 12 }}>
              <input style={inputStyle} placeholder={ui.fieldCustomerName} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              <input style={inputStyle} placeholder={ui.fieldCompanyName} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              <input style={inputStyle} placeholder={ui.fieldPhone} value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input style={inputStyle} placeholder={ui.fieldLineId} value={lineId} onChange={(e) => setLineId(e.target.value)} />
              <input style={inputStyle} placeholder={ui.fieldEmail} value={email} onChange={(e) => setEmail(e.target.value)} />
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                placeholder={ui.fieldNote}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {extractedPreview !== null ? (
              <ExtractedCustomerPreviewCard extracted={extractedPreview} lang={lang} variant="mobile" mb={mb} mt={mt} />
            ) : null}

            <TextInputWithVoice
              lang={lang}
              multiline
              value={text}
              onChange={setText}
              placeholder={ui.linePlaceholder}
              inputStyle={{
                ...block(),
                minHeight: 176,
                borderRadius: 16,
                padding: 16,
                fontSize: 17,
                color: "#111",
                resize: "vertical",
              }}
            />

            <button
              type="button"
              onClick={() => {
                setText("");
                setAnalysis(emptyAnalysis);
                setExtractedPreview(null);
              }}
              style={{
                ...block(),
                height: 52,
                border: "none",
                borderRadius: 14,
                background: "#64748b",
                color: "white",
                fontSize: 18,
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              {ui.clearText}
            </button>

            <button
              type="button"
              onClick={analyze}
              disabled={loading}
              style={{
                ...block(),
                height: 64,
                border: "none",
                borderRadius: 16,
                background: "#1ee05f",
                color: "white",
                fontSize: 22,
                fontWeight: "bold",
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.85 : 1,
              }}
            >
              {loading ? ui.analyzing : ui.startAnalysis}
            </button>

            <button
              type="button"
              onClick={() => void saveToCrm()}
              disabled={savingCrm}
              style={{
                ...block(),
                height: 56,
                border: "none",
                borderRadius: 16,
                background: "#facc15",
                color: "#000",
                fontSize: 19,
                fontWeight: "bold",
                cursor: savingCrm ? "wait" : "pointer",
                opacity: savingCrm ? 0.85 : 1,
              }}
            >
              {savingCrm ? ui.saving : ui.saveToCrm}
            </button>
          </section>

          <section style={{ ...block(), display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ ...block(), margin: 0, fontSize: 22 }}>{ui.analysisResults}</h2>

            <div style={{ ...block(), display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={statCard}>
                <div style={{ ...block(), opacity: 0.85, fontSize: 15 }}>{ui.dealProbability}</div>
                <div style={{ ...block(), marginTop: 8, fontSize: 28, fontWeight: 700 }}>{displayValue(analysis.dealProbability)}</div>
              </div>
              <div style={statCard}>
                <div style={{ ...block(), opacity: 0.85, fontSize: 15 }}>{ui.customerLevel}</div>
                <div style={{ ...block(), marginTop: 8, fontSize: 28, fontWeight: 700 }}>{displayValue(analysis.customerLevel)}</div>
              </div>
              <div style={statCard}>
                <div style={{ ...block(), opacity: 0.85, fontSize: 15 }}>{ui.leakRisk}</div>
                <div style={{ ...block(), marginTop: 8, fontSize: 28, fontWeight: 700 }}>{displayValue(analysis.leakRisk)}</div>
              </div>
              <div style={statCard}>
                <div style={{ ...block(), opacity: 0.85, fontSize: 15 }}>{ui.estimatedAmount}</div>
                <div style={{ ...block(), marginTop: 8, fontSize: 28, fontWeight: 700 }}>{displayValue(analysis.estimatedAmount)}</div>
              </div>
            </div>

            <div style={{ ...block(), display: "flex", flexDirection: "column", gap: 14 }}>
              {analysisFields.map((field) => (
                <div key={field.title} style={resultBox}>
                  <b style={{ ...block(), display: "block", fontSize: 17, fontWeight: 700 }}>{field.title}</b>
                  <p style={{ ...block(), margin: "12px 0 0", fontSize: 16, lineHeight: 1.6 }}>{field.value}</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </>
    );
  }

  const s = getStyles(false);

  return (
    <>
    {copyFallbackModal}
    <main style={s.page}>
      <HomeLandingHero lang={lang} isMobile={false} onStart={scrollToApp} />

      <div style={s.topbar}>
        <div>
          <h1 style={s.logo}>LINE Work AI</h1>
          <p style={s.sub}>{ui.tagline}</p>
        </div>

        <div style={s.topActions}>
          <button type="button" style={s.smallBtn} onClick={toggleLang}>
            {ui.langToggle}
          </button>
          <button type="button" style={s.smallBtn} onClick={handleTestNotification}>
            {ui.testNotification}
          </button>
        </div>
      </div>

      <div style={s.cards}>
        <Card styles={s} title={ui.dealProbability} value={displayValue(analysis.dealProbability)} />
        <Card styles={s} title={ui.customerLevel} value={displayValue(analysis.customerLevel)} />
        <Card styles={s} title={ui.leakRisk} value={displayValue(analysis.leakRisk)} />
        <Card styles={s} title={ui.estimatedAmount} value={displayValue(analysis.estimatedAmount)} />
      </div>

      <TodayFollowUpWorkspace
        rows={workspaceRows}
        lang={lang}
        isMobile={false}
        loading={workspaceLoading}
        loadError={workspaceError}
        onRefresh={() => void loadWorkspaceRows()}
        copyWithFallback={copyWithFallback}
      />

      <FollowUpRemindersSection
        reminders={followUpReminders}
        lang={lang}
        variant="desktop"
        styles={s}
        copyWithFallback={copyWithFallback}
      />

      <div
        style={{
          width: "100%",
          maxWidth: 1200,
          margin: "0 auto 24px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 20,
          boxSizing: "border-box",
        }}
      >
        <HomeCalendarSection customers={calendarRows} lang={lang} isMobile={false} />
        <HomeAlertsSection rows={calendarRows} lang={lang} isMobile={false} />
      </div>

      <div style={s.layout}>
        <aside style={s.sidebar}>
          <h2 style={s.sidebarTitle}>{ui.workspace}</h2>

          <div style={s.menuList}>
            {[
              ui.menuNew,
              ui.menuCustomers,
              ui.menuTasks,
              ui.menuCalendar,
              ui.menuAlerts,
              ui.menuQuotes,
              ui.menuReplies,
            ].map((item, i) => (
              <button key={i} type="button" onClick={() => handleMenuClick(i)} style={activeMenu === i ? s.activeMenu : s.menuBtn}>
                {item}
              </button>
            ))}
          </div>
        </aside>

        <section ref={centerRef} style={s.center}>
          <h2 style={s.centerTitle}>{ui.pasteLine}</h2>
          <p style={s.centerLead}>{ui.pasteLead}</p>

          <div style={s.crmGrid}>
            <input style={s.input} placeholder={ui.fieldCustomerName} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <input style={s.input} placeholder={ui.fieldCompanyName} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <input style={s.input} placeholder={ui.fieldPhone} value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input style={s.input} placeholder={ui.fieldLineId} value={lineId} onChange={(e) => setLineId(e.target.value)} />
            <input style={s.input} placeholder={ui.fieldEmail} value={email} onChange={(e) => setEmail(e.target.value)} />
            <textarea style={s.input} placeholder={ui.fieldNote} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {extractedPreview !== null ? (
            <ExtractedCustomerPreviewCard extracted={extractedPreview} lang={lang} variant="desktop" />
          ) : null}

          <TextInputWithVoice
            lang={lang}
            multiline
            value={text}
            onChange={setText}
            placeholder={ui.linePlaceholder}
            inputStyle={s.textarea}
          />

          <button
            onClick={() => {
              setText("");
              setAnalysis(emptyAnalysis);
              setExtractedPreview(null);
            }}
            style={s.clearBtn}
          >
            {ui.clearText}
          </button>

          <button onClick={analyze} disabled={loading} style={s.analyzeBtn}>
            {loading ? ui.analyzing : ui.startAnalysis}
          </button>

          <button type="button" onClick={() => void saveToCrm()} disabled={savingCrm} style={s.saveCrmBtn}>
            {savingCrm ? ui.saving : ui.saveToCrm}
          </button>
        </section>

        <aside style={s.right}>
          <Result styles={s} title={ui.customerNeeds} value={displayValue(analysis.customerNeed)} />
          <Result styles={s} title={ui.importantDate} value={displayValue(analysis.importantDate)} />
          <Result styles={s} title={ui.customerEmotion} value={displayValue(analysis.customerEmotion)} />
          <Result styles={s} title={ui.nextStep} value={displayValue(analysis.nextStep)} />
          <Result styles={s} title={ui.todo} value={displayValue(analysis.todo)} />
          <Result styles={s} title={ui.replySuggestion} value={displayValue(analysis.replySuggestion)} />
          <Result styles={s} title={ui.followUp} value={displayValue(analysis.followUp)} />
        </aside>
      </div>
    </main>
    </>
  );
}

function Card({ title, value, styles }: any) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <h2 style={styles.cardValue}>{value}</h2>
    </div>
  );
}

function Result({ title, value, styles }: any) {
  return (
    <div style={styles.result}>
      <b style={styles.resultTitle}>{title}</b>
      <p style={styles.resultValue}>{value}</p>
    </div>
  );
}

function ExtractedCustomerPreviewCard({
  extracted,
  lang,
  variant,
  mb,
  mt,
}: {
  extracted: ExtractedCustomerProfile;
  lang: AppLang;
  variant: "mobile" | "desktop";
  mb?: CSSProperties;
  mt?: CSSProperties;
}) {
  const ui = homePageCopy(lang);
  const rows = [
    { label: ui.extractedName, value: extracted.customer_name },
    { label: ui.extractedCompany, value: extracted.company_name },
    { label: ui.extractedPhone, value: extracted.phone },
    { label: ui.fieldLineId, value: extracted.line_id },
    { label: ui.fieldEmail, value: extracted.email },
    { label: ui.extractedNeeds, value: extracted.customer_need },
  ];

  const shell: CSSProperties =
    variant === "mobile"
      ? {
          ...(mb ?? {}),
          ...(mt ?? {}),
          boxSizing: "border-box",
          borderRadius: 18,
          padding: 18,
          border: "1px solid rgba(129, 140, 248, 0.42)",
          background:
            "linear-gradient(155deg, rgba(99,102,241,0.22) 0%, rgba(15,23,42,0.55) 48%, rgba(15,23,42,0.88) 100%)",
          boxShadow: "0 14px 36px rgba(0,0,0,0.35)",
        }
      : {
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          borderRadius: 18,
          padding: 22,
          marginBottom: 18,
          border: "1px solid rgba(129, 140, 248, 0.38)",
          background:
            "linear-gradient(145deg, rgba(99,102,241,0.18) 0%, rgba(17,24,39,0.65) 55%, rgba(15,23,42,0.92) 100%)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
        };

  return (
    <section style={shell} aria-label={ui.extractedTitle}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
            padding: "6px 11px",
            borderRadius: 999,
            background: "linear-gradient(135deg,#818cf8,#c084fc)",
            color: "#0f172a",
          }}
        >
          AI
        </span>
        <div style={{ flex: "1 1 160px", minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: variant === "mobile" ? 17 : 18,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            {ui.extractedTitle}
          </h3>
          <p style={{ margin: "6px 0 0", fontSize: 14, opacity: 0.82, lineHeight: 1.45 }}>
            {ui.extractedHint}
          </p>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((row) => (
          <div
            key={row.label}
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                opacity: 0.72,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {row.label}
            </span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                textAlign: "right",
                flex: "1 1 140px",
                wordBreak: "break-word",
                color: row.value.trim() ? "#f8fafc" : "rgba(248,250,252,0.45)",
              }}
            >
              {row.value.trim() ? row.value : ui.notDetected}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FollowUpRemindersSection({
  reminders,
  lang,
  variant,
  styles,
  mb,
  mt,
  copyWithFallback,
}: {
  reminders: DashboardReminder[];
  lang: AppLang;
  variant: "mobile" | "desktop";
  styles?: Record<string, CSSProperties>;
  mb?: CSSProperties;
  mt?: CSSProperties;
  copyWithFallback: (text: string, options?: import("./hooks/useCopyWithFallback").CopyWithFallbackOptions) => Promise<boolean>;
}) {
  const ui = homePageCopy(lang);
  const title = ui.remindersTitle;
  const emptyHint = ui.remindersEmpty;
  const suggestedLabel = ui.suggestedLabel;
  const copyLabel = ui.copy;
  const copiedHint = ui.copied;

  async function copySuggestion(text: string) {
    await copyWithFallback(text, {
      title: ui.copyFollowUpTitle,
      description: ui.copyFollowUpDesc,
      tapLabel: "Tap to Copy",
      closeLabel: ui.close,
      copiedLabel: copiedHint,
      onSuccess: () => alert(copiedHint),
    });
  }

  if (variant === "mobile" && mb && mt) {
    return (
      <section
        style={{
          ...mb,
          ...mt,
          background: "#132846",
          borderRadius: 16,
          padding: 18,
        }}
      >
        <h2 style={{ ...mb, ...mt, margin: "0 0 14px", fontSize: 22 }}>{title}</h2>
        {reminders.length === 0 ? (
          <p style={{ ...mb, ...mt, margin: 0, opacity: 0.85, fontSize: 15, lineHeight: 1.55 }}>{emptyHint}</p>
        ) : (
          <div style={{ ...mb, ...mt, display: "flex", flexDirection: "column", gap: 14 }}>
            {reminders.map((r) => {
              if (r.id === undefined || r.id === null || String(r.id) === "") return null;
              const fd = normalizeFollowUpDateValue(r.follow_up_date);
              if (!fd) return null;
              const badge = getFollowUpBadge(fd);
              if (badge === "none") return null;
              const cols = followUpBadgeColors(badge);
              const sug = buildSuggestedSalesFollowUp(r, lang);
              const locale = lang;
              return (
                <div
                  key={String(r.id)}
                  style={{
                    ...mb,
                    ...mt,
                    background: "#20334d",
                    borderRadius: 14,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      ...mb,
                      ...mt,
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <Link
                      href={`/customers/${r.id}`}
                      style={{
                        ...mb,
                        ...mt,
                        fontWeight: 700,
                        fontSize: 17,
                        color: "#fff",
                        textDecoration: "none",
                      }}
                    >
                      {r.customer_name?.trim() || ui.unnamed}
                      {r.company_name?.trim() ? ` · ${r.company_name}` : ""}
                    </Link>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        padding: "5px 11px",
                        borderRadius: 999,
                        background: cols.bg,
                        color: cols.color,
                        border: `1px solid ${cols.border}`,
                      }}
                    >
                      {followUpBadgeLabel(badge, lang)}
                    </span>
                    <span style={{ ...mb, ...mt, fontSize: 15, opacity: 0.9 }}>
                      {formatFollowUpDateDisplay(fd, locale)}
                    </span>
                  </div>
                  <div style={{ ...mb, ...mt, fontSize: 13, fontWeight: 700, opacity: 0.9, marginBottom: 8 }}>{suggestedLabel}</div>
                  <textarea
                    readOnly
                    value={sug}
                    style={{
                      ...mb,
                      ...mt,
                      width: "100%",
                      minHeight: 88,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(0,0,0,0.2)",
                      color: "white",
                      fontSize: 15,
                      lineHeight: 1.5,
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void copySuggestion(sug)}
                    style={{
                      ...mb,
                      ...mt,
                      marginTop: 10,
                      padding: "11px 16px",
                      borderRadius: 12,
                      border: "none",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 15,
                      background: "#22c55e",
                      color: "#fff",
                    }}
                  >
                    {copyLabel}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  if (!styles) return null;

  return (
    <section style={styles.followRemindersSection}>
      <h2 style={styles.followRemindersTitle}>{title}</h2>
      {reminders.length === 0 ? (
        <p style={styles.followRemindersEmpty}>{emptyHint}</p>
      ) : (
        <div style={styles.followRemindersList}>
          {reminders.map((r) => {
            if (r.id === undefined || r.id === null || String(r.id) === "") return null;
            const fd = normalizeFollowUpDateValue(r.follow_up_date);
            if (!fd) return null;
            const badge = getFollowUpBadge(fd);
            if (badge === "none") return null;
            const cols = followUpBadgeColors(badge);
            const sug = buildSuggestedSalesFollowUp(r, lang);
            const locale = lang;
            return (
              <div key={String(r.id)} style={styles.followReminderCard}>
                <div style={styles.followReminderCardHead}>
                  <Link href={`/customers/${r.id}`} style={styles.followReminderName}>
                    {r.customer_name?.trim() || ui.unnamed}
                    {r.company_name?.trim() ? ` · ${r.company_name}` : ""}
                  </Link>
                  <span
                    style={{
                      ...styles.followReminderBadge,
                      background: cols.bg,
                      color: cols.color,
                      border: `1px solid ${cols.border}`,
                    }}
                  >
                    {followUpBadgeLabel(badge, lang)}
                  </span>
                  <span style={styles.followReminderWhen}>{formatFollowUpDateDisplay(fd, locale)}</span>
                </div>
                <div style={styles.followReminderSugLabel}>{suggestedLabel}</div>
                <textarea readOnly value={sug} style={styles.followReminderTextarea} />
                <button type="button" onClick={() => void copySuggestion(sug)} style={styles.followReminderCopyBtn}>
                  {copyLabel}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getStyles(isMobile: boolean): any {
  const mobileBox = {
    width: "100%" as const,
    maxWidth: "100%" as const,
    minWidth: 0,
    boxSizing: "border-box" as const,
  };

  const resultText = {
    whiteSpace: "normal" as const,
    wordBreak: "break-word" as const,
    overflowWrap: "anywhere" as const,
    writingMode: "horizontal-tb" as const,
  };

  const mobileBodyText = isMobile
    ? ({
        ...resultText,
        textOrientation: "mixed" as const,
      } as const)
    : {};

  const dashFont =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  return {
    page: {
      minHeight: "100vh",
      background: "linear-gradient(90deg,#06192f,#003c42)",
      padding: isMobile ? 18 : 32,
      color: "white",
      fontFamily: dashFont,
      lineHeight: 1.5,
      position: "relative" as const,
      ...mobileBox,
      ...(isMobile
        ? {
            overflowX: "hidden" as const,
            overflowY: "auto" as const,
            WebkitOverflowScrolling: "touch" as const,
            ...mobileBodyText,
          }
        : {}),
    },

    topbar: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: isMobile ? "flex-start" : "center",
      flexDirection: isMobile ? "column" : "row",
      gap: 18,
      ...mobileBox,
      ...(isMobile ? { overflowX: "hidden" as const, ...mobileBodyText } : {}),
    },

    topActions: {
      display: "flex",
      gap: 10,
      ...mobileBox,
      ...(isMobile
        ? {
            flexWrap: "wrap" as const,
            overflowX: "hidden" as const,
            ...mobileBodyText,
          }
        : { width: "auto", maxWidth: "none" }),
    },

    logo: {
      fontSize: isMobile ? 32 : 56,
      margin: 0,
      lineHeight: 1.2,
      ...mobileBox,
      ...(isMobile ? mobileBodyText : { ...resultText }),
    },

    sub: {
      opacity: 0.85,
      marginTop: 12,
      fontSize: isMobile ? 15 : 18,
      lineHeight: 1.55,
      ...mobileBox,
      ...(isMobile ? mobileBodyText : { ...resultText }),
    },

    smallBtn: {
      padding: isMobile ? "13px 16px" : "11px 20px",
      borderRadius: 12,
      border: "none",
      cursor: "pointer",
      fontSize: isMobile ? 16 : 15,
      boxSizing: "border-box",
      ...(isMobile
        ? {
            ...mobileBox,
            flex: "1 1 auto" as const,
            whiteSpace: "normal",
            wordBreak: "break-word",
            ...mobileBodyText,
          }
        : {
            flex: "unset",
            whiteSpace: "nowrap",
            wordBreak: "break-word",
          }),
    },

    cards: {
      marginTop: 32,
      ...mobileBox,
      ...(isMobile
        ? {
            display: "flex" as const,
            flexDirection: "column" as const,
            alignItems: "stretch" as const,
            gap: 16,
            overflowX: "hidden" as const,
            ...mobileBodyText,
          }
        : {
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 22,
          }),
    },

    card: {
      background: "#20334d",
      borderRadius: 20,
      padding: isMobile ? 20 : 26,
      position: "static" as const,
      float: "none" as const,
      ...mobileBox,
      ...(isMobile
        ? {
            flexShrink: 0,
            minHeight: "auto",
            overflowX: "hidden" as const,
            overflowY: "visible" as const,
            ...mobileBodyText,
          }
        : {
            minHeight: 100,
            overflow: "hidden",
            ...resultText,
          }),
    },

    cardTitle: {
      opacity: 0.85,
      fontSize: isMobile ? 16 : 18,
      ...mobileBox,
      ...(isMobile ? mobileBodyText : { ...resultText }),
    },

    cardValue: {
      fontSize: isMobile ? 30 : 36,
      marginTop: 14,
      marginBottom: 0,
      ...mobileBox,
      ...(isMobile ? mobileBodyText : { ...resultText }),
    },

    followRemindersSection: {
      marginTop: 28,
      ...mobileBox,
      background: "#132846",
      borderRadius: 22,
      padding: isMobile ? 18 : 24,
    },

    followRemindersTitle: {
      margin: "0 0 18px",
      fontSize: isMobile ? 22 : 26,
      fontWeight: 700,
      ...mobileBox,
      ...(isMobile ? mobileBodyText : resultText),
    },

    followRemindersEmpty: {
      margin: 0,
      opacity: 0.85,
      fontSize: isMobile ? 15 : 16,
      lineHeight: 1.55,
      ...mobileBox,
      ...(isMobile ? mobileBodyText : resultText),
    },

    followRemindersList: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
      ...mobileBox,
    },

    followReminderCard: {
      background: "#20334d",
      borderRadius: 18,
      padding: isMobile ? 16 : 20,
      ...mobileBox,
    },

    followReminderCardHead: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 12,
      marginBottom: 14,
      ...mobileBox,
    },

    followReminderName: {
      fontWeight: 700,
      fontSize: isMobile ? 16 : 17,
      color: "#fff",
      textDecoration: "none",
      ...mobileBox,
      ...(isMobile ? mobileBodyText : resultText),
    },

    followReminderBadge: {
      fontSize: 12,
      fontWeight: 700,
      padding: "5px 11px",
      borderRadius: 999,
      whiteSpace: "nowrap",
    },

    followReminderWhen: {
      fontSize: 15,
      opacity: 0.9,
      ...mobileBox,
      ...(isMobile ? mobileBodyText : resultText),
    },

    followReminderSugLabel: {
      fontSize: 13,
      fontWeight: 700,
      opacity: 0.88,
      marginBottom: 8,
      ...mobileBox,
      ...(isMobile ? mobileBodyText : resultText),
    },

    followReminderTextarea: {
      width: "100%",
      minHeight: 96,
      padding: 14,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(0,0,0,0.22)",
      color: "#fff",
      fontSize: 15,
      lineHeight: 1.55,
      resize: "vertical",
      boxSizing: "border-box",
      ...mobileBox,
      ...(isMobile ? mobileBodyText : resultText),
      fontFamily: "inherit",
    },

    followReminderCopyBtn: {
      marginTop: 12,
      padding: "11px 18px",
      borderRadius: 12,
      border: "none",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: 15,
      background: "#22c55e",
      color: "#fff",
      ...mobileBox,
    },

    layout: {
      marginTop: 28,
      ...mobileBox,
      ...(isMobile
        ? {
            display: "flex" as const,
            flexDirection: "column" as const,
            width: "100%",
            maxWidth: "100%",
            overflowX: "hidden" as const,
            gap: 22,
            ...mobileBodyText,
          }
        : {
            display: "grid",
            gridTemplateColumns: "220px minmax(0, 1fr) 280px",
            alignItems: "stretch",
            gap: 26,
            overflowX: "hidden",
          }),
    },

    sidebar: {
      background: "#132846",
      borderRadius: 22,
      padding: isMobile ? 18 : 24,
      overflowY: "visible",
      ...(isMobile
        ? {
            ...mobileBox,
            display: "block" as const,
            overflowX: "hidden" as const,
            ...mobileBodyText,
          }
        : {
            ...mobileBox,
            overflowX: "hidden",
            writingMode: "horizontal-tb",
          }),
    },

    sidebarTitle: {
      marginTop: 0,
      fontSize: isMobile ? 22 : 28,
      marginBottom: isMobile ? 14 : 18,
      ...mobileBox,
      ...(isMobile ? mobileBodyText : { whiteSpace: "normal", wordBreak: "break-word" }),
    },

    menuList: isMobile
      ? {
          display: "flex",
          flexDirection: "column",
          flexWrap: "wrap",
          alignItems: "stretch",
          ...mobileBox,
          gap: 12,
          overflowX: "hidden",
          ...mobileBodyText,
        }
      : {
          display: "flex",
          flexDirection: "column",
          gap: 0,
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          flexWrap: "nowrap",
          boxSizing: "border-box",
        },

    activeMenu: {
      display: "block",
      color: "white",
      background: "#22c55e",
      border: "none",
      padding: isMobile ? "15px 14px" : "15px 16px",
      borderRadius: 12,
      cursor: "pointer",
      fontSize: 16,
      boxSizing: "border-box",
      position: "static" as const,
      float: "none" as const,
      ...(isMobile
        ? {
            ...mobileBox,
            marginBottom: 0,
            textAlign: "left" as const,
            whiteSpace: "normal",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            writingMode: "horizontal-tb",
          }
        : {
            width: "100%",
            minWidth: 0,
            maxWidth: "100%",
            marginBottom: 12,
            textAlign: "left",
            whiteSpace: "nowrap",
            flexShrink: 0,
            writingMode: "horizontal-tb",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }),
    },

    menuBtn: {
      display: "block",
      color: "white",
      background: "transparent",
      border: "none",
      padding: isMobile ? "15px 14px" : "15px 16px",
      borderRadius: 12,
      cursor: "pointer",
      fontSize: 16,
      boxSizing: "border-box",
      position: "static" as const,
      float: "none" as const,
      ...(isMobile
        ? {
            ...mobileBox,
            marginBottom: 0,
            textAlign: "left" as const,
            whiteSpace: "normal",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            writingMode: "horizontal-tb",
          }
        : {
            width: "100%",
            minWidth: 0,
            maxWidth: "100%",
            marginBottom: 12,
            textAlign: "left",
            whiteSpace: "nowrap",
            flexShrink: 0,
            writingMode: "horizontal-tb",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }),
    },

    center: {
      background: "#173653",
      borderRadius: 24,
      padding: isMobile ? 22 : 28,
      ...(isMobile
        ? {
            ...mobileBox,
            display: "block" as const,
            overflowX: "hidden" as const,
            overflowY: "visible" as const,
            ...mobileBodyText,
          }
        : {
            ...mobileBox,
            overflowX: "hidden",
            overflowY: "visible",
            writingMode: "horizontal-tb",
          }),
    },

    centerTitle: {
      margin: "0 0 14px",
      fontSize: isMobile ? 22 : 26,
      fontWeight: 700,
      lineHeight: 1.25,
      letterSpacing: "-0.02em",
      ...mobileBox,
      ...(isMobile ? mobileBodyText : { ...resultText }),
    },

    centerLead: {
      margin: "0 0 24px",
      fontSize: isMobile ? 16 : 17,
      opacity: 0.92,
      lineHeight: 1.55,
      ...mobileBox,
      ...(isMobile ? mobileBodyText : { ...resultText }),
    },

    crmGrid: {
      display: isMobile ? ("flex" as const) : "grid",
      gap: 16,
      marginBottom: 22,
      ...mobileBox,
      ...(isMobile
        ? {
            flexDirection: "column" as const,
            alignItems: "stretch" as const,
            overflowX: "hidden" as const,
            ...mobileBodyText,
          }
        : {
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }),
    },

    input: {
      ...mobileBox,
      padding: isMobile ? 16 : 14,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.08)",
      color: "white",
      outline: "none",
      fontSize: 17,
      ...(isMobile ? mobileBodyText : { whiteSpace: "normal", wordBreak: "break-word" }),
    },

    textarea: {
      ...mobileBox,
      height: isMobile ? 200 : 280,
      borderRadius: 20,
      padding: 18,
      fontSize: 17,
      marginTop: 18,
      color: "black",
      resize: "vertical" as const,
      ...(isMobile
        ? {
            whiteSpace: "normal",
            ...mobileBodyText,
          }
        : {
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }),
    },

    clearBtn: {
      ...mobileBox,
      height: isMobile ? 56 : 52,
      marginTop: 16,
      border: "none",
      borderRadius: 14,
      background: "#64748b",
      color: "white",
      fontSize: 18,
      fontWeight: "bold",
      cursor: "pointer",
      whiteSpace: "normal",
      wordBreak: "break-word",
      ...(isMobile ? mobileBodyText : {}),
    },

    analyzeBtn: {
      ...mobileBox,
      height: isMobile ? 64 : 68,
      marginTop: 18,
      border: "none",
      borderRadius: 18,
      background: "#1ee05f",
      color: "white",
      fontSize: isMobile ? 22 : 28,
      fontWeight: "bold",
      cursor: "pointer",
      whiteSpace: "normal",
      wordBreak: "break-word",
      ...(isMobile ? mobileBodyText : {}),
    },

    saveCrmBtn: {
      ...mobileBox,
      height: isMobile ? 58 : 56,
      marginTop: 12,
      border: "none",
      borderRadius: 18,
      background: "#facc15",
      color: "#000",
      fontSize: isMobile ? 20 : 22,
      fontWeight: "bold",
      cursor: "pointer",
      whiteSpace: "normal",
      wordBreak: "break-word",
      ...(isMobile ? mobileBodyText : {}),
    },

    right: {
      ...(isMobile
        ? {
            ...mobileBox,
            display: "flex" as const,
            flexDirection: "column" as const,
            alignItems: "stretch" as const,
            gap: 16,
            overflowX: "hidden" as const,
            overflowY: "visible" as const,
            ...mobileBodyText,
          }
        : {
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 18,
            ...mobileBox,
            overflowX: "hidden",
            writingMode: "horizontal-tb",
          }),
    },

    result: {
      background: "#203f4a",
      borderRadius: 18,
      padding: isMobile ? 20 : 24,
      position: "static" as const,
      float: "none" as const,
      ...mobileBox,
      ...(isMobile
        ? {
            flexShrink: 0,
            minHeight: "auto",
            overflowX: "hidden" as const,
            overflowY: "visible" as const,
            ...resultText,
          }
        : {
            minHeight: 92,
            overflow: "hidden",
            ...resultText,
          }),
    },

    resultTitle: {
      display: "block",
      fontSize: isMobile ? 16 : 17,
      fontWeight: 700,
      letterSpacing: "-0.01em",
      marginBottom: 2,
      ...mobileBox,
      ...resultText,
    },

    resultValue: {
      margin: "12px 0 0",
      fontSize: isMobile ? 15 : 16,
      lineHeight: 1.6,
      opacity: 0.95,
      ...mobileBox,
      ...resultText,
    },
  };
}