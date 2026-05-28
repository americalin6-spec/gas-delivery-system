"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { supabase } from "../../supabase";
import { useAuthSession } from "../hooks/useAuthSession";
import { useServerTenant } from "../hooks/useServerTenant";
import { DashboardLoadingScreen } from "../components/dashboard/DashboardLoadingScreen";
import { DashboardTenantSetupMessage } from "../components/dashboard/DashboardTenantSetupMessage";
import { formatLocalYmd } from "../lib/followUpReminders";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { useAppLang } from "../hooks/useAppLang";
import { useCopyWithFallback } from "../hooks/useCopyWithFallback";
import { homePageCopy, translateDisplayValue } from "../lib/uiI18n";
import type { AppLang } from "../lib/appLang";
import { DASHBOARD_PATH } from "../lib/authRoutes";
import {
  customerNameForCrm,
  extractCustomerFromLineChat,
  extractHonorificCustomerName,
  extractSocialFieldsFromLineChat,
  isValidExtractedCustomerName,
  NAME_NOT_PROVIDED_EN,
  NAME_NOT_PROVIDED_ZH,
  resolveCustomerNameForForm,
  sanitizeCustomerData,
  type AiAnalyzeCustomerPayload,
  type ExtractedCustomerProfile,
} from "../lib/extractCustomerFromLineChat";
import { AiAnalyzingIndicator } from "../components/AiAnalyzingIndicator";
import { CompanyAiUsagePanel } from "../components/CompanyAiUsagePanel";
import { TodayFollowUpWorkspace } from "../components/TodayFollowUpWorkspace";
import {
  clearDraft,
  emptyHomeFormDraft,
  restoreDraft,
  saveDraft,
  type HomeFormDraft,
} from "../lib/homeFormDraft";
import { type WorkspaceCustomerRow } from "../lib/followUpWorkspace";
import { buildHomeAnalysisMapping } from "../lib/aiAnalysisMapping";
import {
  buildSanitizedCrmDatePayload,
  sanitizeImportantDateFields,
} from "../lib/sanitizeImportantDateFields";
import { upsertCustomerForCompany } from "../lib/customersTenant";
import {
  getCustomerWriteEvents,
  logCustomerWrite,
  subscribeCustomerWriteEvents,
  type CustomerWriteEvent,
} from "../lib/customerWriteDebug";
import {
  beginHomepageSave,
  endHomepageSave,
  getWritesThisSaveClick,
  HOMEPAGE_ANALYZE_SAVE_SOURCE,
  HOMEPAGE_SAVE_SOURCE,
} from "../lib/customerWriteGate";
import {
  mergeFormFromSavedCustomerRow,
  type CrmFormSnapshot,
} from "../lib/mergeCrmFormFields";
import { saveManualPasteConversation } from "../lib/saveManualPasteConversation";
import { customerStatusWritePayload } from "../lib/customerStatus";
import { computeCustomerUrgencyFromImportantDate } from "../lib/customerUrgency";
import { postCrmNotification } from "../lib/crmNotificationsClient";
import { normalizeLineIdForDisplay } from "../lib/lineIdDisplay";
import { buildCustomerSocialInsertFromExtracted } from "../lib/customerSocialMedia";
import {
  getHomeNavItems,
  type HomeNavId,
} from "../lib/crmNavVisibility";

const HOME_MOBILE_MAX_WIDTH = 1024;
const HOME_DEBUG_ENABLED = process.env.NEXT_PUBLIC_DEBUG_COMPANY === "1";

function currentFormSnapshot(
  fields: {
    customerName: string;
    companyName: string;
    industry: string;
    phone: string;
    lineId: string;
    email: string;
    note: string;
  },
): CrmFormSnapshot {
  return {
    customerName: fields.customerName,
    companyName: fields.companyName,
    industry: fields.industry,
    phone: fields.phone,
    lineId: fields.lineId,
    email: fields.email,
    note: fields.note,
  };
}

type AnalyzeResultSnapshot = {
  customer_name: string;
  at: string;
};

function pickCustomerNameForForm(
  mergedName: string,
  parserName: string,
  lineTextInput: string,
  lang: AppLang,
): string {
  const candidates = [
    parserName.trim(),
    extractHonorificCustomerName(lineTextInput),
    mergedName.trim(),
  ].filter(Boolean);

  for (const name of candidates) {
    if (isValidExtractedCustomerName(name)) {
      return name;
    }
  }

  return lang === "zh" ? NAME_NOT_PROVIDED_ZH : NAME_NOT_PROVIDED_EN;
}

const UNNAMED_CUSTOMER_ZH = "未命名客戶";
const UNNAMED_CUSTOMER_EN = "Unnamed customer";

/** CRM insert name — never empty; uses 「未命名客戶」 when extraction/AI left name blank. */
function crmSaveCustomerName(raw: string, lang: AppLang): string {
  const crm = customerNameForCrm(resolveCustomerNameForForm(raw, lang), lang);
  if (!crm.trim() || crm === NAME_NOT_PROVIDED_ZH || crm === NAME_NOT_PROVIDED_EN) {
    return lang === "zh" ? UNNAMED_CUSTOMER_ZH : UNNAMED_CUSTOMER_EN;
  }
  return crm;
}

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

const emptyFormDefaults = emptyHomeFormDraft();

export default function DashboardPageClient() {
  const router = useRouter();
  const centerRef = useRef<HTMLElement>(null);

  const viewportWidth = useViewportWidth();
  const layoutReady = viewportWidth !== null;
  const isMobile = layoutReady && viewportWidth < HOME_MOBILE_MAX_WIDTH;

  const { session, loading: authLoading } = useAuthSession();
  const [mounted, setMounted] = useState(false);
  const [lineText, setLineText] = useState(emptyFormDefaults.lineText);
  const { lang, setLang } = useAppLang();
  const { fallbackModal: copyFallbackModal } = useCopyWithFallback(isMobile, lang);
  const ui = homePageCopy(lang);
  const {
    activeCompanyId,
    activeWorkspaceId,
    ready: tenantReady,
    authUserId,
    error: tenantError,
    refresh: refreshTenant,
  } = useServerTenant();

  const [loading, setLoading] = useState(false);
  const [savingCrm, setSavingCrm] = useState(false);
  const savingRef = useRef(false);
  const saveRequestCountRef = useRef(0);
  const [saveClickCount, setSaveClickCount] = useState(0);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResultSnapshot | null>(null);
  const [customerWriteEvents, setCustomerWriteEvents] = useState<CustomerWriteEvent[]>([]);
  const draftRestoredRef = useRef(false);
  const [activeNavId, setActiveNavId] = useState<HomeNavId>("dashboard");

  const [customerName, setCustomerName] = useState(emptyFormDefaults.customerName);
  const [companyName, setCompanyName] = useState(emptyFormDefaults.companyName);
  const [industry, setIndustry] = useState(emptyFormDefaults.industry);
  const [phone, setPhone] = useState(emptyFormDefaults.phone);
  const [lineId, setLineId] = useState(emptyFormDefaults.lineId);
  const [email, setEmail] = useState(emptyFormDefaults.email);
  const [note, setNote] = useState(emptyFormDefaults.note);

  const [analysis, setAnalysis] = useState(emptyFormDefaults.analysis);
  const [hasExplicitImportantDate, setHasExplicitImportantDate] = useState(false);
  const [extractedPreview, setExtractedPreview] = useState<ExtractedCustomerProfile | null>(null);
  const [workspaceRows, setWorkspaceRows] = useState<WorkspaceCustomerRow[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const showTenantWorkspace =
    tenantReady && Boolean(authUserId) && activeCompanyId > 0 && activeWorkspaceId > 0;

  const draftHydratedRef = useRef(false);
  const draftSnapshotRef = useRef<HomeFormDraft>(emptyHomeFormDraft());

  function buildDraftSnapshot(overrides: Partial<HomeFormDraft> = {}): HomeFormDraft {
    return {
      lineText,
      customerName,
      companyName,
      industry,
      phone,
      lineId,
      email,
      note,
      analysis,
      lang,
      extractedPreview,
      ...overrides,
    };
  }

  draftSnapshotRef.current = buildDraftSnapshot();

  function persistDraftNow(overrides: Partial<HomeFormDraft> = {}) {
    if (!draftHydratedRef.current) return;
    const snapshot = { ...draftSnapshotRef.current, ...overrides };
    draftSnapshotRef.current = snapshot;
    saveDraft(snapshot);
  }

  const loadWorkspaceRows = useCallback(async () => {
    if (!tenantReady || activeCompanyId <= 0 || !authUserId) return;
    setWorkspaceLoading(true);
    setWorkspaceError(tenantError);
    try {
      const res = await fetch("/api/customers", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        rows?: WorkspaceCustomerRow[];
        error?: string;
        companyId?: number;
      };

      if (!res.ok || !json.ok || !Array.isArray(json.rows)) {
        setWorkspaceRows([]);
        setWorkspaceError(json.error ?? `load failed (${res.status})`);
        console.error("[dashboard] customers load failed:", {
          authUserId,
          activeCompanyId,
          apiCompanyId: json.companyId ?? null,
          error: json.error ?? res.status,
        });
      } else {
        const rows = (json.rows as WorkspaceCustomerRow[]).filter(
          (r) => Number(r.company_id) === activeCompanyId,
        );
        const returnedCustomerCompanyIds = [
          ...new Set(rows.map((r) => Number(r.company_id))),
        ];
        console.log("[dashboard] customers loaded:", {
          authUserId,
          activeCompanyId,
          apiCompanyId: json.companyId ?? null,
          customerCount: rows.length,
          returnedCustomerCompanyIds,
        });
        setWorkspaceRows(rows);
        setWorkspaceError(null);
      }
    } catch (err) {
      setWorkspaceRows([]);
      setWorkspaceError(err instanceof Error ? err.message : "load failed");
      console.error("[dashboard] customers load exception:", {
        authUserId,
        activeCompanyId,
        error: err,
      });
    }
    setWorkspaceLoading(false);
  }, [activeCompanyId, authUserId, tenantError, tenantReady]);

  useEffect(() => {
    if (!tenantReady || activeCompanyId <= 0 || !authUserId) {
      setWorkspaceRows([]);
      setWorkspaceError(null);
      setWorkspaceLoading(false);
      return;
    }
    void loadWorkspaceRows();
  }, [loadWorkspaceRows, tenantReady, activeCompanyId, authUserId]);

  useEffect(() => {
    const sync = () => setCustomerWriteEvents(getCustomerWriteEvents());
    sync();
    return subscribeCustomerWriteEvents(sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!draftRestoredRef.current) {
      draftRestoredRef.current = true;
      const draft = restoreDraft();
      setLineText(draft.lineText);
      setCustomerName(draft.customerName);
      setCompanyName(draft.companyName);
      setIndustry(draft.industry);
      setPhone(draft.phone);
      setLineId(draft.lineId);
      setEmail(draft.email);
      setNote(draft.note);
      const restoredDates = sanitizeImportantDateFields(
        draft.analysis as unknown as Record<string, unknown>,
        draft.lineText,
        draft.lang,
      );
      setAnalysis({
        ...draft.analysis,
        importantDate: restoredDates.important_date || "--",
      });
      setHasExplicitImportantDate(restoredDates.hasExplicitImportantDate);
      setExtractedPreview(draft.extractedPreview);
      setLang(draft.lang);
      if (draft.analysis.customerName && draft.analysis.customerName !== "--") {
        setAnalyzeResult({
          customer_name: draft.analysis.customerName,
          at: "restored-draft",
        });
      }
      draftHydratedRef.current = true;
    }
    setMounted(true);
  }, [setLang]);

  useEffect(() => {
    if (typeof window === "undefined" || !draftHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      persistDraftNow();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [lineText, customerName, companyName, industry, phone, lineId, email, note, analysis, lang, extractedPreview]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    return () => {
      persistDraftNow();
    };
  }, []);

  const displayValue = (value: string) => translateDisplayValue(value === "--" ? "" : value, lang);
  /** Extracted / analysis result panels — stable "-" until client mount + draft restore. */
  const analysisResultValue = (value: string) => (mounted ? displayValue(value) : "-");
  /** Dashboard stat cards (deal probability, level, risk, amount). */
  const analysisStatValue = (value: string) => (mounted ? displayValue(value) : "-");

  function clearFormDraft() {
    clearDraft();
    const empty = emptyHomeFormDraft();
    setLineText(empty.lineText);
    setCustomerName(empty.customerName);
    setCompanyName(empty.companyName);
    setIndustry(empty.industry);
    setPhone(empty.phone);
    setLineId(empty.lineId);
    setEmail(empty.email);
    setNote(empty.note);
    setAnalysis(empty.analysis);
    setHasExplicitImportantDate(false);
    setExtractedPreview(empty.extractedPreview);
  }

  function scrollToApp() {
    centerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetAnalysisForm() {
    clearFormDraft();
    setActiveNavId("lineAnalysis");
    scrollToApp();
  }

  function scrollToDashboardTop() {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleNavClick(id: HomeNavId) {
    setActiveNavId(id);

    if (id === "dashboard") {
      router.push(DASHBOARD_PATH);
      setActiveNavId("dashboard");
      scrollToDashboardTop();
      return;
    }

    if (id === "customers") {
      persistDraftNow();
      router.push("/customers");
      return;
    }

    if (id === "crm") {
      persistDraftNow();
      router.push("/customers?focus=search");
      return;
    }

    if (id === "lineAnalysis") {
      router.push(DASHBOARD_PATH);
      setActiveNavId("lineAnalysis");
      scrollToApp();
      return;
    }

    if (id === "tasks") {
      persistDraftNow();
      router.push("/tasks");
      return;
    }

    if (id === "calendar") {
      persistDraftNow();
      router.push("/calendar");
      return;
    }

    if (id === "alerts") {
      persistDraftNow();
      router.push("/alerts");
      return;
    }

    alert(ui.comingSoon);
  }

  /** Only entry point for homepage Save — do not call saveToCrm elsewhere. */
  function handleHomepageSave() {
    setSaveClickCount((n) => n + 1);

    if (savingRef.current || savingCrm) {
      logCustomerWrite({
        requestId: `blocked-click-${Date.now()}`,
        source: "homepage.handleHomepageSave",
        action: "blocked",
        customer_name: customerName || null,
        phone: phone || null,
        line_id: lineId || null,
        company_id: activeCompanyId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    void saveToCrm();
  }

  async function persistHomepageCrm(opts?: {
    source?: string;
    silent?: boolean;
    skipClearDraft?: boolean;
    formOverride?: CrmFormSnapshot;
    analysisOverride?: typeof analysis;
  }) {
    if (savingRef.current || savingCrm) {
      return null;
    }

    if (!tenantReady || activeCompanyId <= 0 || !authUserId) {
      return null;
    }

    const source = opts?.source ?? HOMEPAGE_SAVE_SOURCE;
    const form = opts?.formOverride ?? currentFormSnapshot({
      customerName,
      companyName,
      industry,
      phone,
      lineId,
      email,
      note,
    });
    const analysisPayload = opts?.analysisOverride ?? analysis;

    savingRef.current = true;
    setSavingCrm(true);
    saveRequestCountRef.current += 1;
    const requestNum = saveRequestCountRef.current;

    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `save-${requestNum}-${Date.now()}`;

    beginHomepageSave(requestId);

    try {
      const chatExtracted = extractCustomerFromLineChat(lineText, lang);
      const socialFromChat = extractSocialFieldsFromLineChat(lineText);
      const extractedName = chatExtracted.customer_name.trim();
      const nameForSave = pickCustomerNameForForm(
        extractedName || analyzeResult?.customer_name || form.customerName,
        extractedName,
        lineText,
        lang,
      );

      const crmFields = sanitizeCustomerData(
        {
          customer_name: nameForSave,
          company_name: form.companyName || chatExtracted.company_name,
          industry: form.industry || chatExtracted.industry,
          phone: form.phone || chatExtracted.phone,
          line_id: form.lineId || chatExtracted.line_id,
          email: form.email || chatExtracted.email,
          customer_need: form.note,
        },
        lang,
      );

      const resolvedDisplayName = nameForSave;
      const savedName = isValidExtractedCustomerName(nameForSave)
        ? nameForSave
        : crmSaveCustomerName(crmFields.customer_name, lang);

      if (source !== HOMEPAGE_ANALYZE_SAVE_SOURCE) {
        setCustomerName(resolvedDisplayName);
        setCompanyName(crmFields.company_name);
        setIndustry(crmFields.industry);
        setPhone(crmFields.phone);
        setLineId(normalizeLineIdForDisplay(crmFields.line_id));
        setEmail(crmFields.email);
      }

      const dealProb =
        analysisPayload.dealProbability === "--" ? null : analysisPayload.dealProbability;

      const crmDates = buildSanitizedCrmDatePayload(lineText, lang);

      const baseInsert: Record<string, string | number | boolean | null> = {
        customer_name: savedName,
        company_name: crmFields.company_name.trim() || null,
        industry: crmFields.industry.trim() || null,
        phone: crmFields.phone.trim() || null,
        line_id: crmFields.line_id.trim() || null,
        email: crmFields.email.trim() || null,
        note: form.note.trim() || null,
        customer_need:
          chatExtracted.customer_need?.trim() ||
          (analysisPayload.customerNeed === "--" ? null : analysisPayload.customerNeed),
        important_date: crmDates.important_date,
        customer_emotion:
          analysisPayload.customerEmotion === "--" ? null : analysisPayload.customerEmotion,
        next_step: analysisPayload.nextStep === "--" ? null : analysisPayload.nextStep,
        todo: analysisPayload.todo === "--" ? null : analysisPayload.todo,
        reply_suggestion:
          analysisPayload.replySuggestion === "--" ? null : analysisPayload.replySuggestion,
        follow_up: analysisPayload.followUp === "--" ? null : analysisPayload.followUp,
        ai_summary: [
          analysisPayload.customerNeed === "--" ? null : `需求：${analysisPayload.customerNeed}`,
          analysisPayload.customerEmotion === "--" ? null : `情緒：${analysisPayload.customerEmotion}`,
          analysisPayload.nextStep === "--" ? null : `下一步：${analysisPayload.nextStep}`,
          analysisPayload.followUp === "--" ? null : `跟進：${analysisPayload.followUp}`,
        ]
          .filter(Boolean)
          .join("\n") || null,
        ai_customer_needs:
          analysisPayload.customerNeed === "--" ? null : analysisPayload.customerNeed,
        ai_pain_points: null,
        ai_emotion:
          analysisPayload.customerEmotion === "--" ? null : analysisPayload.customerEmotion,
        ai_next_step: analysisPayload.nextStep === "--" ? null : analysisPayload.nextStep,
        ai_risk_alert: analysisPayload.leakRisk === "--" ? null : analysisPayload.leakRisk,
        ai_follow_up: analysisPayload.followUp === "--" ? null : analysisPayload.followUp,
        ai_probability:
          analysisPayload.dealProbability === "--" ? null : analysisPayload.dealProbability,
        ai_professional_reply:
          analysisPayload.replySuggestion === "--" ? null : analysisPayload.replySuggestion,
        ai_todo: analysisPayload.todo === "--" ? null : analysisPayload.todo,
        success_rate: dealProb,
        customer_level:
          analysisPayload.customerLevel === "--" ? null : analysisPayload.customerLevel,
        churn_risk: analysisPayload.leakRisk === "--" ? null : analysisPayload.leakRisk,
        estimated_amount:
          analysisPayload.estimatedAmount === "--" ? null : analysisPayload.estimatedAmount,
        follow_up_mode: "manual",
        ...customerStatusWritePayload("new_lead"),
        ...buildCustomerSocialInsertFromExtracted(socialFromChat),
      };

      const urgencyFlags = computeCustomerUrgencyFromImportantDate(baseInsert.important_date);
      baseInsert.urgent = urgencyFlags.urgent;
      baseInsert.priority = urgencyFlags.priority;

      baseInsert.follow_up_date = crmDates.follow_up_date;

      console.log("[saveToCrm] upsert request", {
        requestId,
        requestNum,
        activeCompanyId,
        authUserId,
        payload: baseInsert,
      });
      console.log("[analyze-save]", {
        source: "dashboard-analyze",
        requestId,
        companyId: activeCompanyId,
        ai_probability: baseInsert.ai_probability,
        ai_next_step: baseInsert.ai_next_step,
      });

      const { customerId, action, error, customer: savedRow } = await upsertCustomerForCompany(
        supabase,
        activeCompanyId,
        baseInsert,
        { requestId, source, conversationText: lineText, lang },
      );

      console.log("[saveToCrm] upsert response", {
        requestId,
        requestNum,
        action,
        ok: !error,
        id: customerId,
        error: error?.message ?? null,
      });

      if (error) {
        if (!opts?.silent) {
          alert(JSON.stringify(error, null, 2));
        }
        return null;
      }

      if (savedRow) {
        const fromDb = mergeFormFromSavedCustomerRow(form, savedRow);
        setCustomerName(fromDb.customerName);
        setCompanyName(fromDb.companyName);
        setIndustry(fromDb.industry);
        setPhone(fromDb.phone);
        setLineId(normalizeLineIdForDisplay(fromDb.lineId));
        setEmail(fromDb.email);
        setNote(fromDb.note);
        setExtractedPreview({
          customer_name: fromDb.customerName,
          company_name: fromDb.companyName,
          industry: fromDb.industry,
          phone: fromDb.phone,
          line_id: fromDb.lineId,
          email: fromDb.email,
          customer_need: fromDb.note,
        });
      }

      if (customerId && lineText.trim()) {
        await saveManualPasteConversation(customerId, lineText, activeCompanyId);
      }

      if (customerId) {
        void postCrmNotification(activeCompanyId, {
          type: "new_customer",
          customer_id: customerId,
          customer_name: savedName,
          lang,
        });
        if (urgencyFlags.urgent) {
          void postCrmNotification(activeCompanyId, {
            type: "urgent_customer",
            customer_id: customerId,
            customer_name: savedName,
            lang,
          });
        }
      }

      void loadWorkspaceRows();

      if (!opts?.silent) {
        alert(ui.savedToCrm);
      }
      if (!opts?.skipClearDraft) {
        clearFormDraft();
      }
      return customerId;
    } finally {
      endHomepageSave();
      savingRef.current = false;
      setSavingCrm(false);
    }
  }

  async function saveToCrm() {
    await persistHomepageCrm();
  }

  async function analyze() {
    if (!lineText.trim()) {
      alert(ui.pasteRequired);
      return;
    }

    if (loading) {
      console.log("[analyze] blocked — already running");
      return;
    }

    if (!session?.user) {
      console.warn("[analyze] blocked — no authenticated user");
      return;
    }

    if (!tenantReady || activeCompanyId <= 0 || activeWorkspaceId <= 0 || !authUserId) {
      console.warn("[analyze] blocked — workspace not ready", {
        userId: session.user.id,
        tenantReady,
        activeCompanyId,
        activeWorkspaceId,
        authUserId,
        tenantError,
      });
      alert(tenantError ?? "找不到工作區");
      if (!tenantReady || activeCompanyId <= 0 || activeWorkspaceId <= 0) {
        void refreshTenant();
      }
      return;
    }

    setLoading(true);
    const analysisPayload = {
      text: lineText,
      lang,
      company_id: activeCompanyId,
      workspace_id: activeWorkspaceId,
    };
    console.log("[analyze-request] company_id", analysisPayload.company_id);
    console.log("[analyze-request] workspace_id", analysisPayload.workspace_id);

    let aiResult: AiAnalyzeCustomerPayload | null = null;
    try {
      try {
        const aiRes = await fetch("/api/analyze", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(analysisPayload),
        });
        const aiBody = (await aiRes.json()) as AiAnalyzeCustomerPayload & { error?: string };
        if (!aiRes.ok && aiBody.error) {
          alert(aiBody.error);
          return;
        }
        if (aiRes.ok && aiBody && !aiBody.error) {
          aiResult = sanitizeImportantDateFields(
            aiBody as unknown as Record<string, unknown>,
            lineText,
            lang,
          ) as AiAnalyzeCustomerPayload;
        }
      } catch (err) {
        console.error("AI analyze request failed", err);
      }

      const probability = calculateDealProbability(lineText, lang);
      const existingForm = currentFormSnapshot({
        customerName,
        companyName,
        industry,
        phone,
        lineId,
        email,
        note,
      });
      const mapped = buildHomeAnalysisMapping(
        lineText,
        lang,
        aiResult,
        probability,
        existingForm,
      );
      const { confirmed, analysis: mappedAnalysis, extractedPreview } = mapped;

      setAnalyzeResult({
        customer_name: confirmed.customerName,
        at: new Date().toISOString(),
      });

      console.log("AI_RESULT", aiResult);
      console.log("CONFIRMED_CRM", confirmed);
      console.log("INSIGHTS", mapped.insights);

      setCustomerName(confirmed.customerName);
      setCompanyName(confirmed.companyName);
      setIndustry(confirmed.industry);
      setPhone(confirmed.phone);
      setLineId(normalizeLineIdForDisplay(confirmed.lineId));
      setEmail(confirmed.email);
      setNote(confirmed.note);

      setExtractedPreview(extractedPreview);
      setAnalysis(mappedAnalysis);
      setHasExplicitImportantDate(mapped.hasExplicitImportantDate);

      persistDraftNow({
        lineText,
        customerName: confirmed.customerName,
        companyName: confirmed.companyName,
        industry: confirmed.industry,
        phone: confirmed.phone,
        lineId: confirmed.lineId,
        email: confirmed.email,
        note: confirmed.note,
        analysis: mappedAnalysis,
        lang,
        extractedPreview,
      });

      if (tenantReady && activeCompanyId > 0 && authUserId) {
        await persistHomepageCrm({
          source: HOMEPAGE_ANALYZE_SAVE_SOURCE,
          silent: true,
          skipClearDraft: true,
          formOverride: currentFormSnapshot({
            customerName: confirmed.customerName,
            companyName: confirmed.companyName,
            industry: confirmed.industry,
            phone: confirmed.phone,
            lineId: confirmed.lineId,
            email: confirmed.email,
            note: confirmed.note,
          }),
          analysisOverride: mappedAnalysis,
        });
      }

      console.log("[analyze] done", { customerName: confirmed.customerName });
    } finally {
      setLoading(false);
    }
  }

  if (!mounted || authLoading) {
    return <DashboardLoadingScreen message="正在載入儀表板…" />;
  }

  if (!session?.user) {
    return <DashboardLoadingScreen message="正在確認登入狀態…" />;
  }

  if (!tenantReady) {
    return <DashboardLoadingScreen message="正在載入工作區設定…" />;
  }

  if (!authUserId || activeCompanyId <= 0 || activeWorkspaceId <= 0) {
    return (
      <DashboardTenantSetupMessage
        error={tenantError}
        onRetry={() => void refreshTenant()}
      />
    );
  }

  if (!layoutReady) {
    return <DashboardLoadingScreen message="正在準備介面…" />;
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
    const menuItems = getHomeNavItems(lang);

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
      { title: ui.customerNeeds, value: analysisResultValue(analysis.customerNeed) },
      ...(hasExplicitImportantDate
        ? [{ title: ui.importantDate, value: analysisResultValue(analysis.importantDate) }]
        : []),
      { title: ui.customerEmotion, value: analysisResultValue(analysis.customerEmotion) },
      { title: ui.nextStep, value: analysisResultValue(analysis.nextStep) },
      { title: ui.todo, value: analysisResultValue(analysis.todo) },
      { title: ui.replySuggestion, value: analysisResultValue(analysis.replySuggestion) },
      { title: ui.followUp, value: analysisResultValue(analysis.followUp) },
    ];

    return (
      <>
        {loading ? <AiAnalyzingIndicator lang={lang} /> : null}
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
          <header style={{ ...block(), display: "flex", flexDirection: "column", gap: 12 }}>
            <h1 style={{ ...block(), margin: 0, fontSize: 32 }}>LINE Work AI</h1>
            <p style={{ ...block(), margin: 0, opacity: 0.85, fontSize: 16, lineHeight: 1.55 }}>
              {ui.tagline}
            </p>
          </header>

          {showTenantWorkspace ? (
            <CompanyAiUsagePanel
              tenantReady={tenantReady}
              activeCompanyId={activeCompanyId}
              isMobile
            />
          ) : null}

          {showTenantWorkspace ? (
            <TodayFollowUpWorkspace
              enabled={showTenantWorkspace}
              rows={workspaceRows}
              lang={lang}
              isMobile
              loading={workspaceLoading}
              loadError={workspaceError}
            />
          ) : null}

          <section style={{ ...block(), display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={statCard}>
              <div style={{ ...block(), opacity: 0.85, fontSize: 15 }}>{ui.dealProbability}</div>
              <div style={{ ...block(), marginTop: 8, fontSize: 28, fontWeight: 700 }}>{analysisStatValue(analysis.dealProbability)}</div>
            </div>
            <div style={statCard}>
              <div style={{ ...block(), opacity: 0.85, fontSize: 15 }}>{ui.customerLevel}</div>
              <div style={{ ...block(), marginTop: 8, fontSize: 28, fontWeight: 700 }}>{analysisStatValue(analysis.customerLevel)}</div>
            </div>
            <div style={statCard}>
              <div style={{ ...block(), opacity: 0.85, fontSize: 15 }}>{ui.leakRisk}</div>
              <div style={{ ...block(), marginTop: 8, fontSize: 28, fontWeight: 700 }}>{analysisStatValue(analysis.leakRisk)}</div>
            </div>
            <div style={statCard}>
              <div style={{ ...block(), opacity: 0.85, fontSize: 15 }}>{ui.estimatedAmount}</div>
              <div style={{ ...block(), marginTop: 8, fontSize: 28, fontWeight: 700 }}>{analysisStatValue(analysis.estimatedAmount)}</div>
            </div>
          </section>

          <section style={{ ...block(), background: "#132846", borderRadius: 16, padding: 18 }}>
            <h2 style={{ ...block(), margin: "0 0 14px", fontSize: 22 }}>{ui.workspace}</h2>
            <div style={{ ...block(), display: "flex", flexWrap: "wrap", gap: 8 }}>
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  style={menuBtn(activeNavId === item.id)}
                  onClick={() => handleNavClick(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

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
              <input style={inputStyle} placeholder={ui.fieldIndustry} value={industry} onChange={(e) => setIndustry(e.target.value)} />
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

            {mounted && extractedPreview !== null ? (
              <ExtractedCustomerPreviewCard extracted={extractedPreview} lang={lang} variant="mobile" />
            ) : null}

            <textarea
              className="crm-line-conversation-textarea"
              value={lineText}
              onChange={(e) => setLineText(e.target.value)}
              placeholder={ui.linePlaceholder}
              style={{
                ...block(),
                minHeight: 176,
                borderRadius: 16,
                padding: 16,
                resize: "vertical",
              }}
            />

            <button
              type="button"
              onClick={clearFormDraft}
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
              {ui.startAnalysis}
            </button>

            <button
              type="button"
              onClick={handleHomepageSave}
              disabled={savingCrm || loading}
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

            {mounted && HOME_DEBUG_ENABLED ? (
              <HomeIsolateDebugBox
                analyzeResult={analyzeResult}
                formCustomerName={customerName}
                lineText={lineText}
                saveClickCount={saveClickCount}
                writeEvents={customerWriteEvents}
              />
            ) : null}
          </section>

          <section style={{ ...block(), display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ ...block(), margin: 0, fontSize: 22 }}>{ui.analysisResults}</h2>

            <div style={{ ...block(), display: "flex", flexDirection: "column", gap: 14 }}>
              {analysisFields.map((field) => (
                <div key={field.title} style={resultBox}>
                  <b style={{ ...block(), display: "block", fontSize: 17, fontWeight: 700 }}>{field.title}</b>
                  <p
                    style={{
                      ...block(),
                      margin: "12px 0 0",
                      fontSize: 16,
                      lineHeight: 1.6,
                      whiteSpace: field.value.includes("\n") ? "pre-line" : undefined,
                    }}
                  >
                    {field.value}
                  </p>
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
    {loading ? <AiAnalyzingIndicator lang={lang} /> : null}
    {copyFallbackModal}
    <main style={s.page}>
      <div style={s.topbar}>
        <div>
          <h1 style={s.logo}>LINE Work AI</h1>
          <p style={s.sub}>{ui.tagline}</p>
        </div>

      </div>

      {showTenantWorkspace ? (
        <CompanyAiUsagePanel
          tenantReady={tenantReady}
          activeCompanyId={activeCompanyId}
          isMobile={false}
          cardsGridStyle={s.cards}
          cardStyle={s.card}
          cardTitleStyle={s.cardTitle}
          cardValueStyle={s.cardValue}
        />
      ) : null}

      {showTenantWorkspace ? (
        <TodayFollowUpWorkspace
          enabled={showTenantWorkspace}
          rows={workspaceRows}
          lang={lang}
          isMobile={false}
          loading={workspaceLoading}
          loadError={workspaceError}
        />
      ) : null}

      <div style={{ ...s.cards, marginTop: 22 }}>
        <Card styles={s} title={ui.dealProbability} value={analysisStatValue(analysis.dealProbability)} />
        <Card styles={s} title={ui.customerLevel} value={analysisStatValue(analysis.customerLevel)} />
        <Card styles={s} title={ui.leakRisk} value={analysisStatValue(analysis.leakRisk)} />
        <Card styles={s} title={ui.estimatedAmount} value={analysisStatValue(analysis.estimatedAmount)} />
      </div>

      <div style={s.layout}>
        <aside style={s.sidebar}>
          <h2 style={s.sidebarTitle}>{ui.workspace}</h2>

          <div style={s.menuList}>
            {getHomeNavItems(lang).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                style={activeNavId === item.id ? s.activeMenu : s.menuBtn}
              >
                {item.label}
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
            <input style={s.input} placeholder={ui.fieldIndustry} value={industry} onChange={(e) => setIndustry(e.target.value)} />
            <input style={s.input} placeholder={ui.fieldPhone} value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input style={s.input} placeholder={ui.fieldLineId} value={lineId} onChange={(e) => setLineId(e.target.value)} />
            <input style={s.input} placeholder={ui.fieldEmail} value={email} onChange={(e) => setEmail(e.target.value)} />
            <textarea style={s.input} placeholder={ui.fieldNote} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {mounted && extractedPreview !== null ? (
            <ExtractedCustomerPreviewCard extracted={extractedPreview} lang={lang} variant="desktop" />
          ) : null}

          <textarea
            className="crm-line-conversation-textarea"
            value={lineText}
            onChange={(e) => setLineText(e.target.value)}
            placeholder={ui.linePlaceholder}
            style={s.textarea}
          />

          <button type="button" onClick={clearFormDraft} style={s.clearBtn}>
            {ui.clearText}
          </button>

          <button onClick={analyze} disabled={loading} style={s.analyzeBtn}>
            {ui.startAnalysis}
          </button>

          <button
            type="button"
            onClick={handleHomepageSave}
            disabled={savingCrm || loading}
            style={s.saveCrmBtn}
          >
            {savingCrm ? ui.saving : ui.saveToCrm}
          </button>

          {mounted && HOME_DEBUG_ENABLED ? (
            <HomeIsolateDebugBox
              analyzeResult={analyzeResult}
              formCustomerName={customerName}
              lineText={lineText}
              saveClickCount={saveClickCount}
              writeEvents={customerWriteEvents}
            />
          ) : null}
        </section>

        <aside style={s.right}>
          <Result styles={s} title={ui.customerNeeds} value={analysisResultValue(analysis.customerNeed)} />
          {hasExplicitImportantDate ? (
            <Result styles={s} title={ui.importantDate} value={analysisResultValue(analysis.importantDate)} />
          ) : null}
          <Result styles={s} title={ui.customerEmotion} value={analysisResultValue(analysis.customerEmotion)} />
          <Result styles={s} title={ui.nextStep} value={analysisResultValue(analysis.nextStep)} />
          <Result styles={s} title={ui.todo} value={analysisResultValue(analysis.todo)} />
          <Result styles={s} title={ui.replySuggestion} value={analysisResultValue(analysis.replySuggestion)} />
          <Result styles={s} title={ui.followUp} value={analysisResultValue(analysis.followUp)} />
        </aside>
      </div>
    </main>
    </>
  );
}
function HomeIsolateDebugBox({
  analyzeResult,
  formCustomerName,
  lineText,
  saveClickCount,
  writeEvents,
}: {
  analyzeResult: AnalyzeResultSnapshot | null;
  formCustomerName: string;
  lineText: string;
  saveClickCount: number;
  writeEvents: CustomerWriteEvent[];
}) {
  const pre: CSSProperties = {
    margin: 0,
    padding: 10,
    borderRadius: 8,
    background: "rgba(0,0,0,0.35)",
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "ui-monospace, Menlo, monospace",
    color: "#e2e8f0",
  };

  const writeCount = writeEvents.filter((e) => e.action === "insert" || e.action === "update").length;
  const blocked = writeEvents.filter((e) => e.action === "blocked");

  return (
    <section
      style={{
        marginTop: 14,
        padding: 12,
        borderRadius: 10,
        border: "2px solid #f59e0b",
        background: "rgba(15,23,42,0.95)",
      }}
      aria-label="Isolate debug"
    >
      <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>DEBUG — isolate save</h4>
      <pre style={pre}>{`analyzeResult.customer_name: ${analyzeResult?.customer_name ?? "(none)"}
form.customerName: ${formCustomerName || "(empty)"}
textarea (lineText) length: ${lineText.length}
textarea preview: ${lineText.slice(0, 80)}${lineText.length > 80 ? "…" : ""}
save click count: ${saveClickCount}
customer write count (insert/update): ${writeCount}
writes this save click (gate): ${getWritesThisSaveClick()}`}</pre>
      {blocked.length > 0 ? (
        <>
          <p style={{ margin: "8px 0 4px", fontSize: 11, color: "#f87171", fontWeight: 700 }}>
            BLOCKED writes ({blocked.length})
          </p>
          <pre style={pre}>
            {blocked
              .map((e) => `${e.source}\n  ${e.detail ?? e.requestId}\n  at: ${e.timestamp}`)
              .join("\n\n")}
          </pre>
        </>
      ) : null}
      {writeEvents.length > 0 ? (
        <>
          <p style={{ margin: "8px 0 4px", fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>All CUSTOMER_WRITE events</p>
          <pre style={{ ...pre, maxHeight: 200, overflow: "auto" }}>
            {writeEvents
              .map(
                (e, i) =>
                  `${i + 1}. ${e.action} | ${e.source}\n   name=${e.customer_name ?? ""} phone=${e.phone ?? ""} line=${e.line_id ?? ""}`,
              )
              .join("\n")}
          </pre>
        </>
      ) : null}
    </section>
  );
}


function Card({ title, value, styles }: { title: string; value: string; styles: Record<string, CSSProperties> }) {
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
      <p
        style={{
          ...styles.resultValue,
          whiteSpace: typeof value === "string" && value.includes("\n") ? "pre-line" : undefined,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function ExtractedCustomerPreviewCard({
  extracted,
  lang,
  variant,
}: {
  extracted: ExtractedCustomerProfile;
  lang: AppLang;
  variant: "mobile" | "desktop";
}) {
  const ui = homePageCopy(lang);

  const rows = [
    { label: ui.extractedName, value: extracted.customer_name },
    { label: ui.extractedCompany, value: extracted.company_name },
    { label: ui.extractedIndustry, value: extracted.industry },
    { label: ui.extractedPhone, value: extracted.phone },
    { label: ui.fieldLineId, value: normalizeLineIdForDisplay(extracted.line_id) },
    { label: ui.fieldEmail, value: extracted.email },
    { label: ui.extractedNeeds, value: extracted.customer_need },
  ];

  const shell: CSSProperties =
    variant === "mobile"
      ? {
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          borderRadius: 18,
          padding: 18,
          marginBottom: 14,
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
      margin: "14px 0 0",
      fontSize: isMobile ? 30 : 36,
      fontWeight: 800,
      lineHeight: 1.15,
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
      marginTop: 18,
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
