"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useIsViewportBelow } from "../../hooks/useViewportWidth";
import { useAppLang } from "../../hooks/useAppLang";
import { customerDetailCopy } from "../../lib/customersI18n";
import type { AppLang } from "../../lib/appLang";
import { translateDisplayValue } from "../../lib/uiI18n";
import {
  useCopyWithFallback,
  type CopyWithFallbackOptions,
} from "../../hooks/useCopyWithFallback";
import {
  isHighDealProbability,
  normalizeFollowUpDateValue,
} from "../../lib/followUpReminders";
import {
  followUpModeBadgeMeta,
  normalizeFollowUpMode,
  type FollowUpMode,
} from "../../lib/followUpMode";
import { CustomerConversationHistory } from "../../components/CustomerConversationHistory";
import { LineCustomerContactSection } from "../../components/LineCustomerContactSection";
import { LineReplySection } from "../../components/LineReplySection";
import { CustomerInsightSections } from "../../components/CustomerInsightSections";
import { CustomerAiSummaryDashboard } from "../../components/CustomerAiSummaryDashboard";
import { CustomerAiFollowUpSection } from "../../components/CustomerAiFollowUpSection";
import { CustomerSocialMediaSection } from "../../components/CustomerSocialMediaSection";
import { CustomerAiExtractNotice } from "../../components/CustomerAiExtractNotice";
import type { CustomerAiExtractPayload } from "../../components/CustomerAiSummaryDashboard";
import { CUSTOMER_SOCIAL_FIELD_KEYS } from "../../lib/customerSocialMedia";
import {
  buildSanitizedCrmDatePayload,
  sanitizeImportantDateFields,
} from "../../lib/sanitizeImportantDateFields";
import PipelineStatusBadge from "../../components/PipelineStatusBadge";
import PipelineStatusSelect from "../../components/PipelineStatusSelect";
import {
  customerStatusWritePayload,
  getRawCustomerStatus,
  normalizeCustomerStatus,
} from "../../lib/customerStatus";
import { computeCustomerUrgencyFromImportantDate } from "../../lib/customerUrgency";
import {
  formatCustomerCreatedAtDisplay,
  softDeleteCustomerPayload,
} from "../../lib/customerSoftDelete";
import { useServerTenant } from "../../hooks/useServerTenant";
import { DASHBOARD_PATH } from "../../lib/authRoutes";
import { localizeCrmDisplayText } from "../../lib/crmAiDisplayLabels";
import { dt } from "../../lib/customerDetailTypography";
import {
  hasPersistedAiFollowUpContent,
  type CustomerAiFollowUp,
} from "../../lib/customerAiFollowUp";
import {
  mapCustomerRowToAiSummary,
  type CustomerAiSummary,
} from "../../lib/customerAiSummary";
import { supabase } from "../../../supabase";

const MOBILE_MAX = 768;

const ui = {
  pageBg: "linear-gradient(160deg, #0c1222 0%, #111827 42%, #0f172a 100%)",
  surface: "rgba(255,255,255,0.04)",
  surfaceHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.12)",
  text: "#f8fafc",
  muted: "#94a3b8",
  faint: "#64748b",
  accent: "#6366f1",
  accentHover: "#4f46e5",
  success: "#22c55e",
  danger: "#f87171",
  dangerBg: "rgba(239,68,68,0.15)",
  shadow: "0 1px 0 rgba(255,255,255,0.06) inset, 0 18px 48px rgba(0,0,0,0.35)",
  radiusLg: 16,
  radiusMd: 12,
  radiusSm: 8,
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

interface Customer {
  id: string | number;
  company_id?: number | null;
  customer_name?: string | null;
  company_name?: string | null;
  industry?: string | null;
  phone?: string | null;
  line_id?: string | null;
  email?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  xiaohongshu?: string | null;
  youtube?: string | null;
  website?: string | null;
  alternate_contact?: string | null;
  customer_need?: string | null;
  customer_emotion?: string | null;
  important_date?: string | null;
  next_step?: string | null;
  estimated_amount?: string | null;
  success_rate?: string | null;
  customer_level?: string | null;
  churn_risk?: string | null;
  todo?: string | null;
  reply_suggestion?: string | null;
  follow_up?: string | null;
  follow_up_date?: string | null;
  follow_up_mode?: string | null;
  customer_status?: string | null;
  status?: string | null;
  urgent?: boolean | null;
  priority?: string | null;
  note?: string | null;
  last_contacted_at?: string | null;
  line_send_history?: unknown;
  line_user_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  ai_extracted_at?: string | null;
  ai_summary?: string | null;
  ai_customer_needs?: string | null;
  ai_pain_points?: string | null;
  ai_emotion?: string | null;
  ai_next_step?: string | null;
  ai_risk_alert?: string | null;
  ai_follow_up?: string | null;
  ai_probability?: string | null;
  ai_professional_reply?: string | null;
  ai_todo?: string | null;
}

const customerDetailCache = new Map<string, Customer>();

function readCachedCustomer(customerId: string): Customer | null {
  if (!customerId?.trim()) return null;
  return customerDetailCache.get(customerId) ?? null;
}

type Draft = Record<string, string>;

const EDIT_FIELD_KEYS: (keyof Customer)[] = [
  "customer_name",
  "company_name",
  "industry",
  "phone",
  "line_id",
  "email",
  ...CUSTOMER_SOCIAL_FIELD_KEYS,
  "customer_status",
  "note",
  "customer_need",
  "customer_emotion",
  "important_date",
  "next_step",
  "estimated_amount",
  "success_rate",
  "customer_level",
  "churn_risk",
  "todo",
  "reply_suggestion",
  "follow_up_mode",
  "follow_up_date",
  "follow_up",
];

function customerToDraft(c: Customer): Draft {
  const d: Draft = {};
  for (const k of EDIT_FIELD_KEYS) {
    const v = c[k];
    if (k === "follow_up_mode") {
      d[k as string] = normalizeFollowUpMode(v);
      continue;
    }
    if (k === "customer_status") {
      d[k as string] = normalizeCustomerStatus(getRawCustomerStatus(c));
      continue;
    }
    d[k as string] = v == null ? "" : String(v);
  }
  return d;
}

function draftToUpdatePayload(draft: Draft): Record<string, string | boolean | null> {
  const out: Record<string, string | boolean | null> = {};
  for (const [k, v] of Object.entries(draft)) {
    const t = v.trim();
    out[k] = t === "" ? null : t;
  }
  out.follow_up_mode = normalizeFollowUpMode(out.follow_up_mode);
  const st = normalizeCustomerStatus(out.customer_status);
  Object.assign(out, customerStatusWritePayload(st));
  const urgency = computeCustomerUrgencyFromImportantDate(out.important_date);
  out.urgent = urgency.urgent;
  out.priority = urgency.priority;
  return out;
}

function formatLastContact(iso?: string | null): string {
  if (!iso?.trim()) return "—";
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso ?? "—";
  }
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(() => readCachedCustomer(id));
  const customerRef = useRef<Customer | null>(null);
  customerRef.current = customer;
  const [loading, setLoading] = useState(() => !readCachedCustomer(id));
  const [notFound, setNotFound] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [conversationRefresh, setConversationRefresh] = useState(0);
  const [lastExtractColumns, setLastExtractColumns] = useState<string[]>([]);
  const [conversationSourceText, setConversationSourceText] = useState("");
  const [selectedLineUserId, setSelectedLineUserId] = useState<string | null>(null);
  const [selectedLineLabel, setSelectedLineLabel] = useState<string | null>(null);
  const conversationSectionRef = useRef<HTMLElement | null>(null);
  const [manualFollowUpYmd, setManualFollowUpYmd] = useState<string | null>(null);
  const {
    activeCompanyId,
    ready: tenantReady,
    authUserId,
    error: tenantError,
  } = useServerTenant();

  const isMobile = useIsViewportBelow(MOBILE_MAX);
  const { lang } = useAppLang();
  const t = customerDetailCopy(lang);
  const displayValue = (value?: string | null) => {
    if (!value?.trim() || value.trim() === "-") return "-";
    return translateDisplayValue(value, lang);
  };
  const { copyWithFallback, fallbackModal: copyFallbackModal } = useCopyWithFallback(isMobile, lang);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!id?.trim() || !tenantReady || !customer || activeCompanyId <= 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const url = `/api/conversations?customer_id=${encodeURIComponent(id)}`;
        const res = await fetch(url, {
          cache: "no-store",
          credentials: "include",
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          rows?: { message_text?: string | null }[];
        };
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          setConversationSourceText("");
          return;
        }
        const text = (body.rows ?? [])
          .map((r) => String(r.message_text ?? "").trim())
          .filter(Boolean)
          .join("\n");
        setConversationSourceText(text);
      } catch {
        if (!cancelled) setConversationSourceText("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, tenantReady, customer, activeCompanyId, conversationRefresh]);

  const fetchCustomer = useCallback(async (opts?: { silent?: boolean }) => {
    if (!id || !tenantReady || activeCompanyId <= 0 || !authUserId) return;

    const silent = opts?.silent === true;
    const blockUi = !silent && customerRef.current == null;
    if (blockUi) {
      setLoading(true);
      setNotFound(false);
    }

    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        customer?: Customer;
        error?: string;
        companyId?: number;
      };

      if (!res.ok || !body.ok || !body.customer) {
        console.warn("[customerDetail] customer not accessible:", {
          authUserId,
          activeCompanyId,
          customerId: id,
          status: res.status,
          error: body.error ?? null,
        });
        if (!customerRef.current) {
          setCustomer(null);
          setNotFound(true);
        }
      } else {
        const data = body.customer;
        const rowCompanyId = Number(data.company_id);
        if (!Number.isFinite(rowCompanyId) || rowCompanyId !== activeCompanyId) {
          console.warn("[customerDetail] company_id mismatch:", {
            authUserId,
            activeCompanyId,
            customerId: id,
            rowCompanyId: data.company_id ?? null,
          });
          if (!customerRef.current) {
            setCustomer(null);
            setNotFound(true);
          }
        } else {
          console.log("[customerDetail] customer loaded:", {
            authUserId,
            activeCompanyId,
            customerId: id,
            customerCompanyId: rowCompanyId,
          });
          console.log("[customer-load]", {
            customerId: id,
            ai_summary: data.ai_summary ?? null,
            ai_customer_needs: data.ai_customer_needs ?? null,
            ai_pain_points: data.ai_pain_points ?? null,
            ai_emotion: data.ai_emotion ?? null,
            ai_next_step: data.ai_next_step ?? null,
            ai_risk_alert: data.ai_risk_alert ?? null,
            ai_follow_up: data.ai_follow_up ?? null,
            ai_probability: data.ai_probability ?? null,
            ai_professional_reply: data.ai_professional_reply ?? null,
            ai_todo: data.ai_todo ?? null,
          });
          customerDetailCache.set(id, data);
          setCustomer(data);
          setNotFound(false);
          setManualFollowUpYmd(null);
          const primary = data.line_user_id?.trim() || null;
          setSelectedLineUserId((prev) => prev ?? primary);
        }
      }
    } catch (err) {
      console.error("[customerDetail] fetch failed:", err);
      if (!customerRef.current) {
        setCustomer(null);
        setNotFound(true);
      }
    }

    if (blockUi) setLoading(false);
  }, [id, activeCompanyId, authUserId, tenantReady]);

  const selectLineUserForTimeline = useCallback((lineUserId: string, displayLabel: string) => {
    setSelectedLineUserId(lineUserId);
    setSelectedLineLabel(displayLabel);
  }, []);

  const fetchCustomerRef = useRef(fetchCustomer);
  fetchCustomerRef.current = fetchCustomer;

  const handleAiExtractComplete = useCallback((extract: CustomerAiExtractPayload | null) => {
    if (!extract) return;
    const saved = extract.savedFields ?? extract.updatedColumns ?? [];
    if (saved.length === 0) return;
    setLastExtractColumns(saved);
    void fetchCustomerRef.current({ silent: true });
  }, []);

  const runAiSummaryRef = useRef<(() => Promise<void>) | null>(null);
  const runAiFollowUpRef = useRef<(() => Promise<void>) | null>(null);

  const registerAiSummaryRun = useCallback((run: (() => Promise<void>) | null) => {
    runAiSummaryRef.current = run;
  }, []);

  const registerAiFollowUpRun = useCallback((run: (() => Promise<void>) | null) => {
    runAiFollowUpRef.current = run;
  }, []);

  const triggerAiAnalysis = useCallback(() => {
    void runAiSummaryRef.current?.();
    void runAiFollowUpRef.current?.();
  }, []);

  const refreshCustomerSilent = useCallback(() => {
    void fetchCustomerRef.current({ silent: true });
  }, []);

  useEffect(() => {
    const cached = readCachedCustomer(id);
    if (cached) {
      setCustomer(cached);
      setLoading(false);
      setNotFound(false);
    }
    void fetchCustomer({ silent: Boolean(cached) });
  }, [fetchCustomer, id]);

  function startEdit() {
    if (!customer) return;
    setDraft(customerToDraft(customer));
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setDraft({});
  }

  async function saveCustomer() {
    if (!id) return;

    setSaving(true);
    const payload = draftToUpdatePayload(draft);
    const crmDates = buildSanitizedCrmDatePayload(conversationSourceText, lang);
    payload.important_date = crmDates.important_date;
    const draftFollow = normalizeFollowUpDateValue(payload.follow_up_date);
    if (manualFollowUpYmd && draftFollow === manualFollowUpYmd) {
      payload.follow_up_date = draftFollow;
    } else {
      payload.follow_up_date = crmDates.follow_up_date;
    }
    const urgency = computeCustomerUrgencyFromImportantDate(payload.important_date);
    payload.urgent = urgency.urgent;
    payload.priority = urgency.priority;

    const { data, error } = await supabase
      .from("customers")
      .update(payload)
      .eq("company_id", activeCompanyId)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    if (data) {
      const saved = data as Customer;
      customerDetailCache.set(id, saved);
      setCustomer(saved);
      const savedFollow = normalizeFollowUpDateValue(payload.follow_up_date);
      setManualFollowUpYmd(savedFollow);
    }
    setIsEditing(false);
    setDraft({});
    alert(t.saved);
  }

  async function deleteCustomer() {
    if (!id) return;
    const ok = confirm(t.confirmDelete);
    if (!ok) return;

    setDeleting(true);
    const { error } = await supabase
      .from("customers")
      .update(softDeleteCustomerPayload())
      .eq("company_id", activeCompanyId)
      .eq("id", id);
    setDeleting(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/customers");
  }

  function updateDraft(field: string, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  async function persistFollowUpMode(mode: FollowUpMode) {
    if (!id) return;
    setModeSaving(true);
    const { data, error } = await supabase
      .from("customers")
      .update({ follow_up_mode: mode })
      .eq("company_id", activeCompanyId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    setModeSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    if (data) {
      const saved = data as Customer;
      customerDetailCache.set(id, saved);
      setCustomer(saved);
    }
  }

  const showFullPageLoading = loading && !customer;

  const persistedAiSummary = useMemo((): CustomerAiSummary | null => {
    if (!customer) return null;
    return mapCustomerRowToAiSummary(customer);
  }, [
    customer?.ai_customer_needs,
    customer?.ai_pain_points,
    customer?.ai_probability,
    customer?.ai_emotion,
    customer?.ai_next_step,
    customer?.ai_risk_alert,
    customer?.updated_at,
    customer?.ai_extracted_at,
  ]);

  const persistedAiFollowUp = useMemo((): Partial<CustomerAiFollowUp> | null => {
    if (!customer) return null;
    const raw: Partial<CustomerAiFollowUp> = {
      suggestedFollowUpTime: customer.follow_up_date ?? undefined,
      suggestedMessage: customer.ai_follow_up ?? undefined,
      suggestedAction: customer.ai_next_step ?? undefined,
      closingStrategy: customer.ai_summary ?? undefined,
      urgencyLevel: "medium",
      reEngagement: false,
      updatedAt:
        customer.updated_at ?? customer.ai_extracted_at ?? new Date().toISOString(),
    };
    return hasPersistedAiFollowUpContent(raw) ? raw : null;
  }, [
    customer?.follow_up_date,
    customer?.ai_follow_up,
    customer?.ai_next_step,
    customer?.ai_summary,
    customer?.updated_at,
    customer?.ai_extracted_at,
  ]);

  const isHighValue = isHighDealProbability(customer?.success_rate);
  const sanitizedDates = customer
    ? sanitizeImportantDateFields(
        {
          important_date: customer.important_date,
          follow_up_date: customer.follow_up_date,
        },
        conversationSourceText,
        lang,
      )
    : null;
  const hasRealImportantDate = Boolean(
    sanitizedDates?.important_date ||
      (sanitizedDates?.important_dates?.length ?? 0) > 0,
  );
  const displayImportantDate = hasRealImportantDate ? sanitizedDates?.important_date ?? null : null;

  const fl = t.fieldLabels;
  const fieldConfigs: {
    key: keyof Draft;
    label: string;
    multiline?: boolean;
    inputKind?: "date" | "follow_up_mode" | "pipeline_status";
    section: "basic" | "social" | "ai" | "follow";
  }[] = [
    { key: "customer_name", label: fl.customer_name, section: "basic" },
    { key: "company_name", label: fl.company_name, section: "basic" },
    { key: "industry", label: fl.industry, section: "basic" },
    { key: "phone", label: fl.phone, section: "basic" },
    { key: "line_id", label: fl.line_id, section: "basic" },
    { key: "email", label: fl.email, section: "basic" },
    { key: "instagram", label: fl.instagram, section: "social" },
    { key: "facebook", label: fl.facebook, section: "social" },
    { key: "tiktok", label: fl.tiktok, section: "social" },
    { key: "xiaohongshu", label: fl.xiaohongshu, section: "social" },
    { key: "youtube", label: fl.youtube, section: "social" },
    { key: "website", label: fl.website, section: "social" },
    { key: "alternate_contact", label: fl.alternate_contact, section: "social" },
    { key: "customer_status", label: fl.customer_status, inputKind: "pipeline_status", section: "basic" },
    { key: "note", label: fl.note, multiline: true, section: "basic" },
    { key: "customer_need", label: fl.customer_need, multiline: true, section: "ai" },
    { key: "customer_emotion", label: fl.customer_emotion, section: "ai" },
    { key: "important_date", label: fl.important_date, section: "ai" },
    { key: "estimated_amount", label: fl.estimated_amount, section: "ai" },
    { key: "success_rate", label: fl.success_rate, section: "ai" },
    { key: "customer_level", label: fl.customer_level, section: "ai" },
    { key: "churn_risk", label: fl.churn_risk, section: "ai" },
    { key: "next_step", label: fl.next_step, multiline: true, section: "follow" },
    { key: "follow_up_mode", label: fl.follow_up_mode, inputKind: "follow_up_mode", section: "follow" },
    { key: "follow_up_date", label: fl.follow_up_date, inputKind: "date", section: "follow" },
    { key: "todo", label: fl.todo, multiline: true, section: "follow" },
    { key: "follow_up", label: fl.follow_up, multiline: true, section: "follow" },
    { key: "reply_suggestion", label: fl.reply_suggestion, multiline: true, section: "follow" },
  ];

  const maxContent = isMobile ? "100%" : 1120;

  return (
    <>
      <main
      style={{
        minHeight: "100vh",
        background: ui.pageBg,
        color: ui.text,
        fontFamily: ui.font,
        padding: isMobile ? 20 : 40,
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
      }}
    >
      <div style={{ maxWidth: maxContent, margin: "0 auto", width: "100%" }}>
        <nav style={{ marginBottom: isMobile ? 22 : 30 }}>
          <Link
            href="/customers"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 15,
              fontWeight: 600,
              color: ui.muted,
              textDecoration: "none",
              padding: "11px 17px",
              borderRadius: ui.radiusMd,
              border: `1px solid ${ui.border}`,
              background: ui.surface,
              transition: "background 0.15s",
            }}
          >
            <span aria-hidden>←</span>
            {t.customerList}
          </Link>
        </nav>

        {showFullPageLoading ? (
          <div
            style={{
              padding: 52,
              textAlign: "center",
              borderRadius: ui.radiusLg,
              border: `1px solid ${ui.border}`,
              background: ui.surface,
              boxShadow: ui.shadow,
              color: ui.muted,
              fontSize: 17,
              lineHeight: 1.55,
            }}
          >
            {t.loading}
          </div>
        ) : notFound || !customer ? (
          <div
            style={{
              padding: 48,
              borderRadius: ui.radiusLg,
              border: `1px solid ${ui.border}`,
              background: ui.surface,
              boxShadow: ui.shadow,
            }}
          >
            <h1 style={{ margin: "0 0 10px", fontSize: isMobile ? 26 : 30 }}>
              {t.notFoundTitle}
            </h1>
            <p style={{ margin: "0 0 20px", color: ui.muted, fontSize: 17, lineHeight: 1.55 }}>
              {tenantError ?? t.notFoundBody}
            </p>
            <Link
              href={DASHBOARD_PATH}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 15,
                fontWeight: 600,
                color: ui.muted,
                textDecoration: "none",
                padding: "11px 17px",
                borderRadius: ui.radiusMd,
                border: `1px solid ${ui.border}`,
                background: ui.surface,
              }}
            >
              {t.backDashboard}
            </Link>
          </div>
        ) : (
          <>
            <header
              style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "stretch" : "flex-start",
                justifyContent: "space-between",
                gap: 24,
                marginBottom: isMobile ? 18 : 22,
              }}
            >
              <div style={{ display: "flex", gap: 18, minWidth: 0 }}>
                <div
                  aria-hidden
                  style={{
                    width: isMobile ? 56 : 72,
                    height: isMobile ? 56 : 72,
                    borderRadius: ui.radiusLg,
                    background: `linear-gradient(135deg, ${ui.accent}, #a855f7)`,
                    flexShrink: 0,
                    boxShadow: "0 8px 24px rgba(99,102,241,0.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: isMobile ? 22 : 28,
                    fontWeight: 700,
                    color: "white",
                  }}
                >
                  {(customer.customer_name?.trim() || "?")[0]?.toUpperCase() ?? "?"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontSize: dt.pageEyebrow,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: ui.faint,
                    }}
                  >
                    {t.detailEyebrow}
                  </p>
                  <h1
                    style={{
                      margin: "0 0 10px",
                      fontSize: isMobile ? dt.pageH1Mobile : dt.pageH1,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      lineHeight: 1.2,
                      wordBreak: "break-word",
                    }}
                  >
                    {customer.customer_name?.trim()
                      ? customer.customer_name
                      : t.unnamed}
                  </h1>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <PipelineStatusBadge status={getRawCustomerStatus(customer)} lang={lang} />
                    <span
                      style={{
                        fontSize: 15,
                        padding: "6px 13px",
                        borderRadius: 999,
                        fontWeight: 600,
                        background: isHighValue
                          ? "rgba(250,204,21,0.2)"
                          : ui.surface,
                        color: isHighValue ? "#facc15" : ui.muted,
                        border: `1px solid ${isHighValue ? "rgba(250,204,21,0.35)" : ui.border}`,
                      }}
                    >
                      {t.dealProbability}：{customer.success_rate?.trim() ? displayValue(customer.success_rate) : "—"}
                    </span>
                    {(() => {
                      const mMeta = followUpModeBadgeMeta(normalizeFollowUpMode(customer.follow_up_mode), lang);
                      return (
                        <span
                          style={{
                            fontSize: 15,
                            padding: "6px 13px",
                            borderRadius: 999,
                            fontWeight: 600,
                            background: mMeta.bg,
                            color: mMeta.color,
                            border: `1px solid ${mMeta.border}`,
                          }}
                        >
                          {mMeta.label}
                        </span>
                      );
                    })()}
                    <span
                      style={{
                        fontSize: 15,
                        color: ui.muted,
                      }}
                    >
                      ID #{String(customer.id)}
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  width: isMobile ? "100%" : "auto",
                }}
              >
                {!isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={startEdit}
                      style={btnPrimary(isMobile)}
                    >
                      {t.edit}
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => void deleteCustomer()}
                      style={btnDanger(isMobile)}
                    >
                      {deleting ? t.deleting : t.delete}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveCustomer()}
                      style={btnPrimary(isMobile)}
                    >
                      {saving ? t.saving : t.save}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={cancelEdit}
                      style={btnGhost(isMobile)}
                    >
                      {t.cancel}
                    </button>
                  </>
                )}
              </div>
            </header>

            {!isEditing && (
              <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 16 }}>
                <CustomerAiSummaryDashboard
                  customerId={id}
                  companyId={activeCompanyId}
                  conversationSourceText={conversationSourceText}
                  persistedSummary={persistedAiSummary}
                  isMobile={isMobile}
                  registerRun={registerAiSummaryRun}
                  onExtractComplete={handleAiExtractComplete}
                />

                <CustomerAiFollowUpSection
                  customerId={id}
                  companyId={activeCompanyId}
                  customer={customer}
                  conversationSourceText={conversationSourceText}
                  persistedFollowUp={persistedAiFollowUp}
                  isMobile={isMobile}
                  registerRun={registerAiFollowUpRun}
                  copyWithFallback={copyWithFallback}
                  showToast={setToast}
                  onCustomerUpdated={refreshCustomerSilent}
                  onExtractComplete={handleAiExtractComplete}
                />

                <CustomerAiExtractNotice
                  extractedAt={customer.ai_extracted_at}
                  isMobile={isMobile}
                  lastUpdatedColumns={lastExtractColumns}
                />

                <LineCustomerContactSection
                  customerId={id}
                  companyId={activeCompanyId}
                  lineId={customer.line_id}
                  lastContactedAt={customer.last_contacted_at}
                  primaryLineUserId={customer.line_user_id}
                  selectedLineUserId={selectedLineUserId}
                  isMobile={isMobile}
                  showToast={setToast}
                  copyWithFallback={copyWithFallback}
                  onLineIdSaved={refreshCustomerSilent}
                  onSelectLineUser={selectLineUserForTimeline}
                  cardStyle={{
                    ...compactCard(isMobile),
                    border: "1px solid rgba(6, 199, 85, 0.35)",
                    background:
                      "linear-gradient(155deg, rgba(6,199,85,0.08) 0%, rgba(15,23,42,0.88) 100%)",
                  }}
                />

                <LineReplySection
                  customer={customer}
                  customerId={id}
                  lineUserId={selectedLineUserId ?? customer.line_user_id ?? null}
                  isMobile={isMobile}
                  showToast={setToast}
                  copyWithFallback={copyWithFallback}
                  onAfterLineSend={() => {
                    setConversationRefresh((n) => n + 1);
                    triggerAiAnalysis();
                    refreshCustomerSilent();
                  }}
                  cardStyle={{
                    ...compactCard(isMobile),
                    border: "1px solid rgba(99,102,241,0.35)",
                    background:
                      "linear-gradient(155deg, rgba(99,102,241,0.1) 0%, rgba(15,23,42,0.88) 100%)",
                  }}
                />

                <section ref={conversationSectionRef} id="customer-conversation-history">
                  <CustomerConversationHistory
                    customerId={String(customer.id)}
                    isMobile={isMobile}
                    lang="zh"
                    refreshSignal={conversationRefresh}
                    lineUserId={selectedLineUserId}
                    compact
                    titleOverride={
                      selectedLineLabel
                        ? `對話時間軸 · ${selectedLineLabel}`
                        : "對話時間軸"
                    }
                  />
                </section>
              </div>
            )}

            {isEditing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
<EditSection title={t.sectionBasic} isMobile={isMobile}>
                  {fieldConfigs
                    .filter((f) => f.section === "basic")
                    .map((f) => (
                      <FieldInput
                        key={f.key}
                        cfg={f}
                        draft={draft}
                        onChange={updateDraft}
                        isMobile={isMobile}
                        lang={lang}
                      />
                    ))}
                </EditSection>
                <EditSection title={t.sectionSocial} isMobile={isMobile}>
                  {fieldConfigs
                    .filter((f) => f.section === "social")
                    .map((f) => (
                      <FieldInput
                        key={f.key}
                        cfg={f}
                        draft={draft}
                        onChange={updateDraft}
                        isMobile={isMobile}
                        lang={lang}
                      />
                    ))}
                </EditSection>
<EditSection title={t.sectionAi} isMobile={isMobile}>
                  {fieldConfigs
                    .filter((f) => f.section === "ai")
                    .map((f) => (
                      <FieldInput
                        key={f.key}
                        cfg={f}
                        draft={draft}
                        onChange={updateDraft}
                        isMobile={isMobile}
                        lang={lang}
                      />
                    ))}
                </EditSection>
<EditSection title={t.sectionFollow} isMobile={isMobile}>
                  {fieldConfigs
                    .filter((f) => f.section === "follow")
                    .map((f) => (
                      <FieldInput
                        key={f.key}
                        cfg={f}
                        draft={draft}
                        onChange={updateDraft}
                        isMobile={isMobile}
                        lang={lang}
                      />
                    ))}
                </EditSection>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 16 }}>
                <section style={compactCard(isMobile)}>
                  <h2 style={compactSectionHeading}>基本資料</h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                      gap: isMobile ? 12 : 14,
                    }}
                  >
                    <CompactDetailRow label="客戶姓名" value={customer.customer_name} />
                    <CompactDetailRow label="公司" value={customer.company_name} />
                    <CompactDetailRow label="產業" value={customer.industry} />
                    <CompactDetailRow label="電話" value={customer.phone} />
                    <CompactDetailRow label="電子郵件" value={customer.email} />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: dt.labelUpper,
                          fontWeight: 700,
                          color: ui.faint,
                          marginBottom: 4,
                        }}
                      >
                        客戶狀態
                      </div>
                      <PipelineStatusBadge status={getRawCustomerStatus(customer)} lang="zh" />
                    </div>
                    <CompactDetailRow
                      label="最後聯絡時間"
                      value={formatLastContact(customer.last_contacted_at)}
                    />
                  </div>
                </section>

                <CustomerSocialMediaSection customer={customer} isMobile={isMobile} />

                <AdvancedAnalysisSection
                  customer={customer}
                  conversationSourceText={conversationSourceText}
                  displayImportantDate={displayImportantDate}
                  isMobile={isMobile}
                  modeSaving={modeSaving}
                  onPersistFollowUpMode={(m) => void persistFollowUpMode(m)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </main>
      {copyFallbackModal}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            zIndex: 9999,
            bottom: isMobile ? 20 : 28,
            left: "50%",
            transform: "translateX(-50%)",
            width: isMobile ? "calc(100% - 32px)" : "min(440px, calc(100% - 48px))",
            maxWidth: 440,
            padding: "16px 20px",
            borderRadius: 14,
            border: "1px solid rgba(34,197,94,0.45)",
            background: "linear-gradient(145deg, rgba(6,199,85,0.95), rgba(15,23,42,0.96))",
            color: "#ecfdf5",
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.45,
            boxShadow: "0 22px 50px rgba(0,0,0,0.45)",
            boxSizing: "border-box",
          }}
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}

const compactSectionHeading: CSSProperties = {
  margin: "0 0 12px",
  fontSize: dt.compactSection,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: ui.faint,
};

function compactCard(isMobile: boolean): CSSProperties {
  return {
    borderRadius: ui.radiusLg,
    border: `1px solid ${ui.border}`,
    background: ui.surface,
    boxShadow: ui.shadow,
    padding: isMobile ? 14 : 18,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    minWidth: 0,
  };
}

function CompactDetailRow({ label, value }: { label: string; value?: string | null }) {
  const text = value?.trim();
  const display = text ? localizeCrmDisplayText(text) : "尚無資料";
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: dt.labelUpper, fontWeight: 700, color: ui.faint, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: dt.paragraph,
          color: text ? ui.text : ui.muted,
          lineHeight: dt.lineHeightBody,
          wordBreak: "break-word",
          whiteSpace: display.length > 80 ? "pre-wrap" : "normal",
        }}
      >
        {display}
      </div>
    </div>
  );
}

function AdvancedAnalysisSection({
  customer,
  conversationSourceText,
  displayImportantDate,
  isMobile,
  modeSaving,
  onPersistFollowUpMode,
}: {
  customer: Customer;
  conversationSourceText: string;
  displayImportantDate: string | null;
  isMobile: boolean;
  modeSaving: boolean;
  onPersistFollowUpMode: (mode: FollowUpMode) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section style={compactCard(isMobile)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: 0,
          border: "none",
          background: "transparent",
          color: ui.text,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <h2 style={{ ...compactSectionHeading, margin: 0 }}>進階分析</h2>
        <span style={{ fontSize: dt.meta, color: ui.muted, fontWeight: 600 }}>
          {open ? "收起" : "展開"}
        </span>
      </button>

      {open ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <h3
              style={{
                margin: "0 0 10px",
                fontSize: dt.label,
                fontWeight: 700,
                color: ui.faint,
              }}
            >
              AI 追蹤發送模式
            </h3>
            <FollowUpModeSegmented
              value={normalizeFollowUpMode(customer.follow_up_mode)}
              onChange={onPersistFollowUpMode}
              disabled={modeSaving}
              isMobile={isMobile}
            />
          </div>

          <div>
            <h3
              style={{
                margin: "0 0 10px",
                fontSize: dt.label,
                fontWeight: 700,
                color: ui.faint,
              }}
            >
              指標與分析
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <CompactDetailRow label="成交機率" value={customer.success_rate} />
              <CompactDetailRow label="客戶等級" value={customer.customer_level} />
              <CompactDetailRow label="流失風險" value={customer.churn_risk} />
              <CompactDetailRow label="預估金額" value={customer.estimated_amount} />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                gap: 10,
                marginTop: 10,
              }}
            >
              <CompactDetailRow label="客戶需求" value={customer.customer_need} />
              <CompactDetailRow label="客戶情緒" value={customer.customer_emotion} />
              {displayImportantDate ? (
                <CompactDetailRow label="重要日期" value={displayImportantDate} />
              ) : null}
            </div>
          </div>

          <div>
            <h3
              style={{
                margin: "0 0 10px",
                fontSize: dt.label,
                fontWeight: 700,
                color: ui.faint,
              }}
            >
              追蹤與回覆
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <CompactDetailRow label="下一步" value={customer.next_step} />
              <CustomerInsightSections
                lang="zh"
                textScale="detail"
                sourceText={conversationSourceText}
                labels={{
                  todo: "待辦事項",
                  replySuggestion: "專業回覆",
                  followUp: "追蹤訊息",
                  aiSend: "AI 追蹤發送模式",
                  note: "備註",
                  noExplicitDate: "無明確日期",
                }}
                todo={customer.todo}
                reply_suggestion={customer.reply_suggestion}
                follow_up={customer.follow_up}
                follow_up_mode={customer.follow_up_mode}
                showFollowUpReminder={false}
                showNote={false}
                clampLongText
              />
              <CompactDetailRow label="備註" value={customer.note} />
            </div>
          </div>

          {(customer.created_at || customer.updated_at) && (
            <div style={{ fontSize: dt.meta, color: ui.muted, lineHeight: dt.lineHeight }}>
              {customer.created_at ? (
                <div>
                  建檔時間：
                  {formatCustomerCreatedAtDisplay(customer.created_at, "zh") ?? customer.created_at}
                </div>
              ) : null}
              {customer.updated_at ? <div>更新時間：{formatTs(customer.updated_at)}</div> : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}


function FollowUpModeSegmented({
  value,
  onChange,
  disabled,
  isMobile,
}: {
  value: FollowUpMode;
  onChange: (m: FollowUpMode) => void;
  disabled?: boolean;
  isMobile: boolean;
  lang?: AppLang;
}) {
  const modes: FollowUpMode[] = ["manual", "assisted", "auto"];
  const labels: Record<FollowUpMode, string> = {
    manual: "手動",
    assisted: "輔助",
    auto: "自動",
  };
  const hints: Record<FollowUpMode, string> = {
    manual: "提醒與建議",
    assisted: "草稿＋確認",
    auto: "自動送出",
  };

  return (
    <div
      role="radiogroup"
      aria-label="AI 追蹤發送模式"
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: 8,
        padding: 4,
        borderRadius: ui.radiusMd,
        background: "rgba(0,0,0,0.28)",
        border: `1px solid ${ui.borderStrong}`,
      }}
    >
      {modes.map((m) => {
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(m)}
            style={{
              flex: isMobile ? "unset" : 1,
              width: isMobile ? "100%" : "auto",
              textAlign: "left",
              padding: isMobile ? "10px 12px" : "10px 14px",
              borderRadius: ui.radiusMd,
              border: active ? `1px solid rgba(129,140,248,0.85)` : `1px solid transparent`,
              cursor: disabled ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: 14,
              color: active ? "#fff" : ui.muted,
              background: active
                ? "linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.92))"
                : "transparent",
              opacity: disabled ? 0.65 : 1,
            }}
          >
            <div>{labels[m]}</div>
            <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.8 }}>{hints[m]}</div>
          </button>
        );
      })}
    </div>
  );
}

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const sectionHeading: CSSProperties = {
  margin: "0 0 24px",
  fontSize: dt.compactSection,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: ui.faint,
};

function cardStyle(isMobile: boolean): CSSProperties {
  return {
    borderRadius: ui.radiusLg,
    border: `1px solid ${ui.border}`,
    background: ui.surface,
    boxShadow: ui.shadow,
    padding: isMobile ? 22 : 34,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    minWidth: 0,
  };
}

function btnPrimary(isMobile: boolean): CSSProperties {
  return {
    flex: isMobile ? "1 1 auto" : "unset",
    minWidth: isMobile ? 0 : 120,
    padding: "13px 22px",
    borderRadius: ui.radiusMd,
    border: "none",
    fontWeight: 600,
    fontSize: 16,
    cursor: "pointer",
    background: ui.accent,
    color: "#fff",
    boxShadow: "0 4px 14px rgba(99,102,241,0.4)",
  };
}

function btnGhost(isMobile: boolean): CSSProperties {
  return {
    flex: isMobile ? "1 1 auto" : "unset",
    padding: "13px 22px",
    borderRadius: ui.radiusMd,
    border: `1px solid ${ui.borderStrong}`,
    fontWeight: 600,
    fontSize: 16,
    cursor: "pointer",
    background: "transparent",
    color: ui.text,
  };
}

function btnDanger(isMobile: boolean): CSSProperties {
  return {
    flex: isMobile ? "1 1 auto" : "unset",
    padding: "13px 22px",
    borderRadius: ui.radiusMd,
    border: `1px solid rgba(248,113,113,0.35)`,
    fontWeight: 600,
    fontSize: 16,
    cursor: "pointer",
    background: ui.dangerBg,
    color: ui.danger,
    width: isMobile ? "auto" : "auto",
  };
}

function DetailRow({
  label,
  value,
  multiline,
  span2,
}: {
  label: string;
  value?: string | null;
  multiline?: boolean;
  span2?: boolean;
}) {
  const t = value?.trim();
  const show = t ? localizeCrmDisplayText(t) : "—";
  return (
    <div style={{ gridColumn: span2 ? "1 / -1" : undefined, minWidth: 0 }}>
      <div
        style={{
          fontSize: dt.labelUpper,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: ui.faint,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: dt.detailValue,
          color: ui.text,
          lineHeight: multiline ? dt.lineHeightBody : dt.lineHeight,
          wordBreak: "break-word",
          whiteSpace: multiline ? "pre-wrap" : "normal",
        }}
      >
        {show}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value?: string | null }) {
  const t = value?.trim();
  return (
    <div
      style={{
        borderRadius: ui.radiusMd,
        border: `1px solid ${ui.border}`,
        background: ui.surfaceHover,
        padding: "17px 20px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: dt.labelUpper, fontWeight: 700, color: ui.faint, marginBottom: 10 }}>
        {label}
      </div>
      <div
        style={{ fontSize: dt.metricValue, fontWeight: 700, color: ui.text, wordBreak: "break-word" }}
      >
        {t ? localizeCrmDisplayText(t) : "—"}
      </div>
    </div>
  );
}

function Panel({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string | null;
  highlight?: boolean;
}) {
  const t = value?.trim();
  return (
    <div
      style={{
        borderRadius: ui.radiusMd,
        border: `1px solid ${highlight ? "rgba(99,102,241,0.45)" : ui.border}`,
        background: highlight ? "rgba(99,102,241,0.08)" : ui.surfaceHover,
        padding: 20,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: dt.labelUpper,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: highlight ? "#a5b4fc" : ui.faint,
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: dt.paragraph,
          lineHeight: dt.lineHeightBody,
          color: ui.text,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {t ? localizeCrmDisplayText(t) : "—"}
      </p>
    </div>
  );
}

function EditSection({
  title,
  children,
  isMobile,
}: {
  title: string;
  children: ReactNode;
  isMobile: boolean;
}) {
  return (
    <section style={cardStyle(isMobile)}>
      <h2 style={sectionHeading}>{title}</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
          gap: 22,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function FieldInput({
  cfg,
  draft,
  onChange,
  isMobile,
  lang,
}: {
  cfg: {
    key: keyof Draft;
    label: string;
    multiline?: boolean;
    inputKind?: "date" | "follow_up_mode" | "pipeline_status";
  };
  draft: Draft;
  onChange: (k: string, v: string) => void;
  isMobile: boolean;
  lang: AppLang;
}) {
  const spanAll =
    cfg.multiline ||
    cfg.inputKind === "date" ||
    cfg.inputKind === "follow_up_mode" ||
    cfg.inputKind === "pipeline_status";

  if (cfg.inputKind === "follow_up_mode") {
    return (
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: dt.paragraph, fontWeight: 600, color: ui.muted }}>{cfg.label}</span>
        <FollowUpModeSegmented
          value={normalizeFollowUpMode(draft[cfg.key])}
          onChange={(m) => onChange(cfg.key as string, m)}
          isMobile={isMobile}
          lang={lang}
        />
      </div>
    );
  }

  if (cfg.inputKind === "pipeline_status") {
    return (
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: dt.paragraph, fontWeight: 600, color: ui.muted }}>{cfg.label}</span>
        <PipelineStatusSelect
          value={draft[cfg.key]}
          onChange={(next) => onChange(cfg.key as string, next)}
          lang={lang}
          variant="segmented"
          size={isMobile ? "sm" : "md"}
        />
      </div>
    );
  }

  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        gridColumn: spanAll ? "1 / -1" : undefined,
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: dt.paragraph, fontWeight: 600, color: ui.muted }}>{cfg.label}</span>
      {cfg.multiline ? (
        <textarea
          value={draft[cfg.key] ?? ""}
          onChange={(e) => onChange(cfg.key as string, e.target.value)}
          rows={4}
          style={inputBase(true)}
        />
      ) : cfg.inputKind === "date" ? (
        <input
          type="date"
          value={draft[cfg.key] ?? ""}
          onChange={(e) => onChange(cfg.key as string, e.target.value)}
          style={inputBase(false)}
        />
      ) : (
        <input
          type="text"
          value={draft[cfg.key] ?? ""}
          onChange={(e) => onChange(cfg.key as string, e.target.value)}
          style={inputBase(false)}
        />
      )}
    </label>
  );
}

function inputBase(multiline: boolean): CSSProperties {
  return {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: "14px 16px",
    borderRadius: ui.radiusMd,
    border: `1px solid ${ui.borderStrong}`,
    background: "rgba(15,23,42,0.85)",
    color: ui.text,
    fontSize: dt.paragraph,
    fontFamily: ui.font,
    outline: "none",
    minWidth: 0,
    lineHeight: dt.lineHeight,
    resize: multiline ? ("vertical" as const) : undefined,
    minHeight: multiline ? 112 : undefined,
  };
}
