"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useIsViewportBelow } from "../../hooks/useViewportWidth";
import { useAppLang } from "../../hooks/useAppLang";
import { customerDetailCopy, followUpBadgeLabelForLang } from "../../lib/customersI18n";
import type { AppLang } from "../../lib/appLang";
import { translateDisplayValue } from "../../lib/uiI18n";
import {
  useCopyWithFallback,
  type CopyWithFallbackOptions,
} from "../../hooks/useCopyWithFallback";
import {
  buildSuggestedSalesFollowUp,
  computeHighPotentialFollowUpDate,
  formatFollowUpDateDisplay,
  getFollowUpBadge,
  isHighDealProbability,
  normalizeFollowUpDateValue,
  type FollowUpBadge,
} from "../../lib/followUpReminders";
import {
  followUpModeBadgeMeta,
  normalizeFollowUpMode,
  type FollowUpMode,
} from "../../lib/followUpMode";
import { CustomerConversationHistory } from "../../components/CustomerConversationHistory";
import { LineOpenFallbackModal } from "../../components/LineOpenFallbackModal";
import PipelineStatusBadge from "../../components/PipelineStatusBadge";
import PipelineStatusSelect from "../../components/PipelineStatusSelect";
import { normalizePipelineStatus } from "../../lib/pipelineStatus";
import { tryOpenLineApp } from "../../lib/openLineApp";
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

function followUpBadgePresentation(badge: FollowUpBadge, lang: AppLang): {
  bg: string;
  color: string;
  border: string;
  label: string;
} {
  const label = followUpBadgeLabelForLang(badge, lang);
  switch (badge) {
    case "overdue":
      return {
        bg: "rgba(239,68,68,0.22)",
        color: "#fecaca",
        border: "rgba(248,113,113,0.45)",
        label,
      };
    case "soon":
      return {
        bg: "rgba(245,158,11,0.22)",
        color: "#fde68a",
        border: "rgba(251,191,36,0.45)",
        label,
      };
    case "upcoming":
      return {
        bg: "rgba(59,130,246,0.2)",
        color: "#bfdbfe",
        border: "rgba(96,165,250,0.45)",
        label,
      };
    default:
      return { bg: "transparent", color: ui.muted, border: ui.border, label: "" };
  }
}

interface Customer {
  id: string | number;
  customer_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  line_id?: string | null;
  email?: string | null;
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
  status?: string | null;
  note?: string | null;
  last_contacted_at?: string | null;
  line_send_history?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
}

type Draft = Record<string, string>;

const EDIT_FIELD_KEYS: (keyof Customer)[] = [
  "customer_name",
  "company_name",
  "phone",
  "line_id",
  "email",
  "status",
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
    if (k === "status") {
      d[k as string] = normalizePipelineStatus(v);
      continue;
    }
    d[k as string] = v == null ? "" : String(v);
  }
  return d;
}

function draftToUpdatePayload(draft: Draft): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(draft)) {
    const t = v.trim();
    out[k] = t === "" ? null : t;
  }
  out.follow_up_mode = normalizeFollowUpMode(out.follow_up_mode);
  out.status = normalizePipelineStatus(out.status);
  return out;
}

type LineSendLogEntry = { at: string; kind?: string };

function parseSendHistory(raw: unknown): LineSendLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LineSendLogEntry[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "at" in item) {
      const at = (item as { at: unknown }).at;
      if (typeof at === "string") {
        const kind = (item as { kind?: unknown }).kind;
        out.push({ at, kind: typeof kind === "string" ? kind : undefined });
      }
    }
  }
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

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [conversationRefresh, setConversationRefresh] = useState(0);

  const logOutboundMessage = useCallback(
    async (messageText: string): Promise<boolean> => {
      const text = messageText.trim();
      if (!id || !text) return false;
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: String(id),
            message_text: text,
            direction: "outbound",
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !body.ok) {
          console.error("[customers/[id]] outbound log failed:", {
            status: res.status,
            error: body.error,
          });
          return false;
        }
        setConversationRefresh((n) => n + 1);
        return true;
      } catch (err) {
        console.error("[customers/[id]] outbound log threw:", err);
        return false;
      }
    },
    [id],
  );

  const isMobile = useIsViewportBelow(MOBILE_MAX);
  const { lang } = useAppLang();
  const t = customerDetailCopy(lang);
  const displayValue = (value?: string | null) => {
    if (!value?.trim() || value.trim() === "-") return "-";
    return translateDisplayValue(value, lang);
  };
  const { copyWithFallback, fallbackModal: copyFallbackModal } = useCopyWithFallback(isMobile);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const fetchCustomer = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setNotFound(false);

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error(error);
      setCustomer(null);
      setNotFound(true);
    } else if (!data) {
      setCustomer(null);
      setNotFound(true);
    } else {
      let row = data as Customer;
      if (isHighDealProbability(row.success_rate) && !normalizeFollowUpDateValue(row.follow_up_date)) {
        const nd = computeHighPotentialFollowUpDate();
        const { data: patched, error: patchErr } = await supabase
          .from("customers")
          .update({ follow_up_date: nd })
          .eq("id", id)
          .select("*")
          .maybeSingle();
        if (!patchErr && patched) row = patched as Customer;
      }
      setCustomer(row);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    void fetchCustomer();
  }, [fetchCustomer]);

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

    if (isHighDealProbability(payload.success_rate) && !payload.follow_up_date) {
      payload.follow_up_date = computeHighPotentialFollowUpDate();
    }

    const { data, error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    if (data) {
      setCustomer(data as Customer);
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
    const { error } = await supabase.from("customers").delete().eq("id", id);
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
      .eq("id", id)
      .select("*")
      .maybeSingle();
    setModeSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    if (data) setCustomer(data as Customer);
  }

  const isHighValue = isHighDealProbability(customer?.success_rate);

  const fl = t.fieldLabels;
  const fieldConfigs: {
    key: keyof Draft;
    label: string;
    multiline?: boolean;
    inputKind?: "date" | "follow_up_mode" | "pipeline_status";
    section: "basic" | "ai" | "follow";
  }[] = [
    { key: "customer_name", label: fl.customer_name, section: "basic" },
    { key: "company_name", label: fl.company_name, section: "basic" },
    { key: "phone", label: fl.phone, section: "basic" },
    { key: "line_id", label: fl.line_id, section: "basic" },
    { key: "email", label: fl.email, section: "basic" },
    { key: "status", label: fl.status, inputKind: "pipeline_status", section: "basic" },
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

        {loading ? (
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
            <p style={{ margin: 0, color: ui.muted, fontSize: 17, lineHeight: 1.55 }}>
              {t.notFoundBody}
            </p>
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
                marginBottom: isMobile ? 28 : 36,
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
                      fontSize: 14,
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
                      fontSize: isMobile ? 28 : 38,
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
                    <PipelineStatusBadge status={customer.status} lang={lang} />
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
                      const fd = normalizeFollowUpDateValue(customer.follow_up_date);
                      if (!fd) return null;
                      const b = getFollowUpBadge(fd);
                      if (b === "none") return null;
                      const pres = followUpBadgePresentation(b, lang);
                      return (
                        <span
                          style={{
                            fontSize: 15,
                            padding: "6px 13px",
                            borderRadius: 999,
                            fontWeight: 600,
                            background: pres.bg,
                            color: pres.color,
                            border: `1px solid ${pres.border}`,
                          }}
                        >
                          {t.followUpPrefix} {formatFollowUpDateDisplay(fd, lang)} · {pres.label}
                        </span>
                      );
                    })()}
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
              <LineQuickActionsBar
                customer={customer}
                customerId={id}
                isMobile={isMobile}
                lang={lang}
                showToast={setToast}
                copyWithFallback={copyWithFallback}
                onAfterSimulatedSend={() => void fetchCustomer()}
                logOutboundMessage={logOutboundMessage}
              />
            )}

            {!isEditing && (
              <section
                style={{
                  ...cardStyle(isMobile),
                  marginBottom: isMobile ? 28 : 36,
                  border: "1px solid rgba(99,102,241,0.28)",
                  background:
                    "linear-gradient(155deg, rgba(99,102,241,0.14) 0%, rgba(15,23,42,0.72) 55%, rgba(15,23,42,0.92) 100%)",
                  boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    justifyContent: "space-between",
                    alignItems: isMobile ? "stretch" : "flex-start",
                    gap: 18,
                    marginBottom: 20,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ ...sectionHeading, marginBottom: 10 }}>{t.followUpModeTitle}</h2>
                    <p style={{ margin: 0, color: ui.muted, fontSize: 15, lineHeight: 1.55 }}>
                      {followUpModeBadgeMeta(normalizeFollowUpMode(customer.follow_up_mode), lang).subtitle}
                      {" · "}
                      <span style={{ color: ui.faint }}>{t.lineNotConnected}</span>
                    </p>
                  </div>
                  {modeSaving ? (
                    <span style={{ fontSize: 14, color: ui.faint, fontWeight: 600, flexShrink: 0 }}>
                      {t.syncing}
                    </span>
                  ) : null}
                </div>
                <FollowUpModeSegmented
                  value={normalizeFollowUpMode(customer.follow_up_mode)}
                  onChange={(m) => void persistFollowUpMode(m)}
                  disabled={modeSaving}
                  isMobile={isMobile}
                  lang={lang}
                />
              </section>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                <section style={cardStyle(isMobile)}>
                  <h2 style={sectionHeading}>{t.sectionBasic}</h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "1fr"
                        : "repeat(2, minmax(0, 1fr))",
                      gap: isMobile ? 18 : 22,
                    }}
                  >
                    <DetailRow label={fl.customer_name} value={customer.customer_name} />
                    <DetailRow label={fl.company_name} value={customer.company_name} />
                    <DetailRow label={fl.phone} value={customer.phone} />
                    <DetailRow label={fl.line_id} value={customer.line_id} />
                    <DetailRow label={fl.email} value={customer.email} span2 />
                    <DetailRow label={t.lastContact} value={formatLastContact(customer.last_contacted_at)} />
                    <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: ui.faint,
                          marginBottom: 8,
                        }}
                      >
                        {fl.status}
                      </div>
                      <PipelineStatusBadge status={customer.status} lang={lang} />
                    </div>
                    <DetailRow label={fl.note} value={customer.note} multiline span2 />
                  </div>
                </section>

                <section style={cardStyle(isMobile)}>
                  <h2 style={sectionHeading}>{t.sectionMetrics}</h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "1fr"
                        : "repeat(4, minmax(0, 1fr))",
                      gap: 16,
                      marginBottom: 26,
                    }}
                  >
                    <MetricCard label={fl.success_rate} value={displayValue(customer.success_rate)} />
                    <MetricCard label={fl.customer_level} value={displayValue(customer.customer_level)} />
                    <MetricCard label={fl.churn_risk} value={displayValue(customer.churn_risk)} />
                    <MetricCard label={fl.estimated_amount} value={displayValue(customer.estimated_amount)} />
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "1fr"
                        : "repeat(2, minmax(0, 1fr))",
                      gap: isMobile ? 18 : 22,
                    }}
                  >
                    <DetailRow label={fl.customer_need} value={displayValue(customer.customer_need)} multiline span2 />
                    <DetailRow label={fl.customer_emotion} value={displayValue(customer.customer_emotion)} />
                    <DetailRow label={fl.important_date} value={displayValue(customer.important_date)} />
                  </div>
                </section>

                <section style={cardStyle(isMobile)}>
                  <h2 style={sectionHeading}>{t.sectionFollowPanel}</h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "1fr"
                        : "repeat(2, minmax(0, 1fr))",
                      gap: 22,
                    }}
                  >
                    <Panel label={fl.next_step} value={displayValue(customer.next_step)} />
                    <Panel
                      label={fl.follow_up_date}
                      value={
                        normalizeFollowUpDateValue(customer.follow_up_date)
                          ? formatFollowUpDateDisplay(customer.follow_up_date, lang)
                          : undefined
                      }
                    />
                    <Panel label={fl.todo} value={displayValue(customer.todo)} />
                    <Panel label={fl.follow_up} value={displayValue(customer.follow_up)} highlight />
                    <Panel label={fl.reply_suggestion} value={displayValue(customer.reply_suggestion)} />
                  </div>
                  <FollowUpMessagingBlock
                    customer={customer}
                    mode={normalizeFollowUpMode(customer.follow_up_mode)}
                    isMobile={isMobile}
                    lang={lang}
                    copyWithFallback={copyWithFallback}
                    logOutboundMessage={logOutboundMessage}
                  />
                </section>

                <CustomerConversationHistory
                  customerId={String(customer.id)}
                  isMobile={isMobile}
                  lang={lang}
                  refreshSignal={conversationRefresh}
                />

                {(customer.created_at || customer.updated_at) && (
                  <section style={{ ...cardStyle(isMobile), opacity: 0.92 }}>
                    <h2 style={sectionHeading}>{t.sectionRecords}</h2>
                    <div
                      style={{
                        display: "grid",
                        gap: 14,
                        fontSize: 15,
                        lineHeight: 1.55,
                        color: ui.muted,
                      }}
                    >
                      {customer.created_at && (
                        <div>
                          {t.createdAt}：{formatTs(customer.created_at)}
                        </div>
                      )}
                      {customer.updated_at && (
                        <div>
                          {t.updatedAt}：{formatTs(customer.updated_at)}
                        </div>
                      )}
                    </div>
                  </section>
                )}
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

const LINE_BRAND = "#06C755";

function LineQuickActionsBar({
  customer,
  customerId,
  isMobile,
  lang,
  showToast,
  copyWithFallback,
  onAfterSimulatedSend,
  logOutboundMessage,
}: {
  customer: Customer;
  customerId: string;
  isMobile: boolean;
  lang: AppLang;
  showToast: (message: string) => void;
  copyWithFallback: (text: string, options?: CopyWithFallbackOptions) => Promise<boolean>;
  onAfterSimulatedSend: () => void | Promise<void>;
  logOutboundMessage: (messageText: string) => Promise<boolean>;
}) {
  const t = customerDetailCopy(lang);
  const [sendBusy, setSendBusy] = useState(false);
  const [lineOpenFallback, setLineOpenFallback] = useState(false);
  const openLineCleanupRef = useRef<(() => void) | null>(null);

  const lid = customer.line_id?.trim() ?? "";
  const followUpDraft = buildSuggestedSalesFollowUp(customer, lang);
  const historyEntries = parseSendHistory(customer.line_send_history)
    .slice()
    .reverse()
    .slice(0, 20);

  const copyModalOpts = {
    title: "Copy follow-up message",
    description:
      "Automatic copy is unavailable on this device. Tap below to copy, then paste into LINE.",
    tapLabel: "Tap to Copy",
    closeLabel: "Close",
    copiedLabel: "Copied!",
  };

  async function copyClip(kind: string, text: string, logAsOutbound = false) {
    const body = text.trim();
    if (!body) {
      alert(t.nothingToCopy);
      return;
    }
    await copyWithFallback(body, {
      ...copyModalOpts,
      title: `Copy ${kind}`,
      description: "Tap the button to copy, then paste where you need it.",
      onSuccess: () => {
        alert(t.copiedKind(kind));
        if (logAsOutbound) void logOutboundMessage(body);
      },
    });
  }

  useEffect(() => {
    return () => {
      openLineCleanupRef.current?.();
    };
  }, []);

  function openLineAppWithFallback() {
    openLineCleanupRef.current?.();
    openLineCleanupRef.current = tryOpenLineApp(() => setLineOpenFallback(true));
  }

  async function copyLineId() {
    if (!lid) {
      alert(t.noLineIdAlert);
      return;
    }
    await copyWithFallback(lid, {
      title: t.copyLineId,
      description: t.openLineSearch,
      tapLabel: "Tap to Copy",
      closeLabel: "Close",
      copiedLabel: "Copied!",
      onSuccess: () => showToast(t.lineIdCopied),
    });
  }

  async function completeSimulatedSend() {
    const { data: row, error: selErr } = await supabase
      .from("customers")
      .select("line_send_history")
      .eq("id", customerId)
      .maybeSingle();

    if (selErr) {
      showToast(selErr.message);
      return;
    }

    const prev = parseSendHistory(row?.line_send_history);
    const nowIso = new Date().toISOString();
    const next = [...prev, { at: nowIso, kind: "simulated_send" }].slice(-80);

    const { error: upErr } = await supabase
      .from("customers")
      .update({ last_contacted_at: nowIso, line_send_history: next })
      .eq("id", customerId);

    if (upErr) {
      showToast(upErr.message);
      return;
    }

    void logOutboundMessage(followUpDraft);
    await onAfterSimulatedSend();
    showToast(t.followUpCopiedToast);
    window.setTimeout(() => openLineAppWithFallback(), 520);
  }

  async function handleSimulatedSendToLine() {
    if (!lid || sendBusy) return;
    const msg = followUpDraft.trim();
    if (!msg) {
      showToast(t.noFollowUpToCopy);
      return;
    }

    setSendBusy(true);
    const copied = await copyWithFallback(msg, {
      ...copyModalOpts,
      onSuccess: () => void completeSimulatedSend(),
    });
    setSendBusy(false);
    if (!copied) {
      // Modal shown; onSuccess runs after user taps "Tap to Copy"
    }
  }

  const shell: CSSProperties = {
    ...cardStyle(isMobile),
    marginBottom: isMobile ? 22 : 28,
    border: `1px solid rgba(6, 199, 85, 0.35)`,
    background:
      "linear-gradient(155deg, rgba(6,199,85,0.14) 0%, rgba(15,23,42,0.78) 48%, rgba(15,23,42,0.94) 100%)",
    boxShadow: "0 18px 44px rgba(0,0,0,0.32)",
  };

  const row: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "stretch",
  };

  const pillLabel: CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.08em",
    padding: "6px 11px",
    borderRadius: 999,
    background: LINE_BRAND,
    color: "#fff",
    flexShrink: 0,
  };

  const btnGhostLine: CSSProperties = {
    flex: isMobile ? "1 1 100%" : "1 1 calc(50% - 6px)",
    minWidth: isMobile ? 0 : 160,
    padding: "14px 18px",
    borderRadius: ui.radiusMd,
    border: `1px solid rgba(255,255,255,0.14)`,
    background: "rgba(0,0,0,0.22)",
    color: ui.text,
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
    textAlign: "center",
    textDecoration: "none",
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "border-color 0.15s, background 0.15s",
  };

  const btnPrimaryLine: CSSProperties = {
    ...btnGhostLine,
    border: `1px solid rgba(6,199,85,0.55)`,
    background: `linear-gradient(135deg, ${LINE_BRAND}, #05a849)`,
    color: "#fff",
    boxShadow: "0 10px 26px rgba(6,199,85,0.35)",
  };

  const btnSendSimulated: CSSProperties = {
    width: "100%",
    padding: "16px 20px",
    borderRadius: ui.radiusMd,
    border: "2px solid rgba(255,255,255,0.35)",
    background: `linear-gradient(135deg, rgba(255,255,255,0.16), rgba(6,199,85,0.35))`,
    color: "#fff",
    fontWeight: 800,
    fontSize: 16,
    cursor: lid && !sendBusy ? "pointer" : "not-allowed",
    opacity: lid && !sendBusy ? 1 : 0.5,
    boxShadow: "0 14px 36px rgba(6,199,85,0.25)",
    boxSizing: "border-box",
  };

  return (
    <section style={shell} aria-label="LINE 快速操作">
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "flex-start",
          justifyContent: "space-between",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
          <span style={pillLabel}>LINE</span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ ...sectionHeading, marginBottom: 8 }}>{t.lineQuickContact}</h2>
            <p style={{ margin: 0, color: ui.muted, fontSize: 15, lineHeight: 1.55 }}>
              {t.lineQuickLead}
              {lid ? (
                <>
                  {" "}
                  {t.lineLastSend}
                  <span style={{ color: ui.text, fontWeight: 700 }}>{formatLastContact(customer.last_contacted_at)}</span>
                </>
              ) : (
                <>{t.lineNoId}</>
              )}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <button
          type="button"
          style={btnSendSimulated}
          disabled={!lid || sendBusy}
          onClick={() => void handleSimulatedSendToLine()}
        >
          {sendBusy ? t.processingLine : t.sendToLine}
        </button>
        <p style={{ margin: 0, fontSize: 13, color: ui.faint, lineHeight: 1.45 }}>
          {t.sendToLineHint}
        </p>

        <div
          style={{
            padding: 16,
            borderRadius: ui.radiusMd,
            border: "1px solid rgba(6,199,85,0.35)",
            background: "rgba(6,199,85,0.08)",
          }}
        >
          <p style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "#86efac", lineHeight: 1.45 }}>
{t.openLineSearch}
          </p>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(0,0,0,0.28)",
              fontSize: 17,
              fontWeight: 700,
              wordBreak: "break-all",
              textAlign: "center",
              marginBottom: 14,
              color: lid ? ui.text : ui.faint,
            }}
          >
{lid || t.noLineId}
          </div>
          <div style={{ ...row, marginBottom: 0 }}>
            <button
              type="button"
              style={{ ...btnPrimaryLine, flex: isMobile ? "1 1 100%" : "1 1 auto" }}
              disabled={!lid}
              onClick={() => void copyLineId()}
            >
{t.copyLineId}
            </button>
            <button type="button" style={{ ...btnGhostLine, flex: isMobile ? "1 1 100%" : "1 1 auto" }} onClick={openLineAppWithFallback}>
{t.openLineApp}
            </button>
          </div>
        </div>

        <div style={{ ...row, marginTop: 14 }}>
          <button
            type="button"
            style={btnGhostLine}
            onClick={() => void copyClip(t.copyFollowUp, followUpDraft, true)}
          >
{t.copyFollowUp}
          </button>
        </div>
      </div>

      <LineOpenFallbackModal
        open={lineOpenFallback}
        lineId={lid}
        isMobile={isMobile}
        onClose={() => setLineOpenFallback(false)}
        onCopiedId={() => showToast(t.lineIdCopied)}
      />

      <div
        style={{
          marginTop: 22,
          paddingTop: 18,
          borderTop: `1px solid rgba(255,255,255,0.1)`,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", color: ui.faint, marginBottom: 12 }}>
{t.sendHistory}
        </div>
        {historyEntries.length === 0 ? (
<p style={{ margin: 0, fontSize: 14, color: ui.muted }}>{t.noSendHistory}</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {historyEntries.map((e, i) => (
              <li
                key={`${e.at}-${i}`}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: ui.radiusMd,
                  border: `1px solid rgba(255,255,255,0.08)`,
                  background: "rgba(0,0,0,0.18)",
                  fontSize: 14,
                }}
              >
                <span style={{ color: ui.text, fontWeight: 600 }}>
                  {formatLastContact(e.at)}
                </span>
                <span style={{ color: ui.faint, fontSize: 13 }}>
                  {e.kind === "simulated_send" ? t.simulatedSend : e.kind ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FollowUpModeSegmented({
  value,
  onChange,
  disabled,
  isMobile,
  lang,
}: {
  value: FollowUpMode;
  onChange: (m: FollowUpMode) => void;
  disabled?: boolean;
  isMobile: boolean;
  lang: AppLang;
}) {
  const t = customerDetailCopy(lang);
  const modes: FollowUpMode[] = ["manual", "assisted", "auto"];
  const labels: Record<FollowUpMode, string> = {
    manual: t.modeManual,
    assisted: t.modeAssisted,
    auto: t.modeAuto,
  };
  const hints: Record<FollowUpMode, string> = {
    manual: t.modeHintManual,
    assisted: t.modeHintAssisted,
    auto: t.modeHintAuto,
  };

  return (
    <div
      role="radiogroup"
      aria-label={t.modeRadiogroup}
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: 10,
        padding: 6,
        borderRadius: ui.radiusLg,
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
              padding: "14px 18px",
              borderRadius: ui.radiusMd,
              border: active ? `1px solid rgba(129,140,248,0.85)` : `1px solid transparent`,
              cursor: disabled ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: 16,
              color: active ? "#fff" : ui.muted,
              background: active
                ? "linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.92))"
                : "transparent",
              boxShadow: active ? "0 12px 28px rgba(99,102,241,0.35)" : "none",
              opacity: disabled ? 0.65 : 1,
              transition: "background 0.18s, box-shadow 0.18s, border-color 0.18s",
            }}
          >
            <div style={{ marginBottom: 4 }}>{labels[m]}</div>
            <div style={{ fontSize: 13, fontWeight: 500, opacity: active ? 0.92 : 0.75 }}>{hints[m]}</div>
          </button>
        );
      })}
    </div>
  );
}

function FollowUpMessagingBlock({
  customer,
  mode,
  isMobile,
  lang,
  copyWithFallback,
  logOutboundMessage,
}: {
  customer: Customer;
  mode: FollowUpMode;
  isMobile: boolean;
  lang: AppLang;
  copyWithFallback: (text: string, options?: CopyWithFallbackOptions) => Promise<boolean>;
  logOutboundMessage: (messageText: string) => Promise<boolean>;
}) {
  const t = customerDetailCopy(lang);
  const suggested = buildSuggestedSalesFollowUp(customer, lang);
  const [assistedDraft, setAssistedDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSimulatedAt, setLastSimulatedAt] = useState<string | null>(null);
  const [autoBanner, setAutoBanner] = useState<string | null>(null);
  const autoRanForId = useRef<string | null>(null);

  useEffect(() => {
    setAssistedDraft("");
    setLastSimulatedAt(null);
    setAutoBanner(null);
    autoRanForId.current = null;
  }, [customer.id]);

  useEffect(() => {
    if (mode !== "auto") return;
    const key = String(customer.id);
    if (autoRanForId.current === key) return;
    autoRanForId.current = key;
    const timer = window.setTimeout(() => {
      const ts = new Date().toLocaleString(lang === "zh" ? "zh-TW" : undefined);
      setLastSimulatedAt(ts);
      setAutoBanner(t.autoBanner);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [mode, customer.id]);

  async function copy(text: string) {
    const body = text.trim();
    if (!body) {
      alert(t.nothingToCopy);
      return;
    }
    await copyWithFallback(body, {
      title: t.copyFollowUpTitle,
      description: t.copyFollowUpDesc,
      tapLabel: "Tap to Copy",
      closeLabel: t.close,
      copiedLabel: t.copiedExclaim,
      onSuccess: () => {
        alert(t.copied);
        void logOutboundMessage(body);
      },
    });
  }

  async function simulateSend(payload: string, requireConfirm: boolean) {
    const body = payload.trim();
    if (!body) {
      alert(t.nothingToSend);
      return;
    }
    if (requireConfirm) {
      const ok = confirm(t.confirmSimulated);
      if (!ok) return;
    }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 700));
    setBusy(false);
    const ts = new Date().toLocaleString("zh-TW");
    setLastSimulatedAt(ts);
    void logOutboundMessage(body);
    alert(requireConfirm ? t.simulatedSent : t.simulatedAutoSent);
  }

  const manualHint = t.manualHint;
  const assistedHint = t.assistedHint;
  const autoHint = t.autoHint;

  const bannerStyle: CSSProperties = {
    marginBottom: 16,
    padding: "14px 18px",
    borderRadius: ui.radiusMd,
    border: `1px solid ${ui.borderStrong}`,
    background: "rgba(99,102,241,0.08)",
    color: ui.muted,
    fontSize: 15,
    lineHeight: 1.55,
  };

  return (
    <div style={{ marginTop: isMobile ? 22 : 26 }}>
      {mode === "manual" && (
        <>
          <div style={bannerStyle}>{manualHint}</div>
          <div
            style={{
              borderRadius: ui.radiusMd,
              border: "1px solid rgba(99,102,241,0.45)",
              background: "rgba(99,102,241,0.08)",
              padding: isMobile ? 18 : 22,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "#a5b4fc",
                marginBottom: 12,
              }}
            >
              {t.suggestedNotSent}
            </div>
            <textarea readOnly value={suggested} style={{ ...inputBase(true), minHeight: 120, marginBottom: 14 }} />
            <button type="button" onClick={() => void copy(suggested)} style={btnPrimary(isMobile)}>
              {t.copySuggested}
            </button>
          </div>
        </>
      )}

      {mode === "assisted" && (
        <>
          <div style={bannerStyle}>{assistedHint}</div>
          <div
            style={{
              borderRadius: ui.radiusMd,
              border: "1px solid rgba(245,158,11,0.35)",
              background: "rgba(245,158,11,0.07)",
              padding: isMobile ? 18 : 22,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "#fcd34d",
                marginBottom: 12,
              }}
            >
              {t.aiDraftTitle}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAssistedDraft(suggested)}
                style={{
                  ...btnGhost(isMobile),
                  borderColor: "rgba(251,191,36,0.35)",
                  color: "#fde68a",
                }}
              >
                {t.generateDraft}
              </button>
              <button type="button" disabled={busy} onClick={() => void copy(assistedDraft || suggested)} style={btnGhost(isMobile)}>
                {t.copyDraft}
              </button>
            </div>
            <textarea
              value={assistedDraft}
              onChange={(e) => setAssistedDraft(e.target.value)}
              placeholder={t.draftPlaceholder}
              style={{ ...inputBase(true), minHeight: 140, marginBottom: 14 }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void simulateSend(assistedDraft || suggested, true)}
              style={{
                ...btnPrimary(isMobile),
                background: "linear-gradient(135deg,#f59e0b,#ea580c)",
                boxShadow: "0 8px 22px rgba(245,158,11,0.35)",
              }}
            >
              {busy ? t.processing : t.confirmSimulatedSend}
            </button>
          </div>
        </>
      )}

      {mode === "auto" && (
        <>
          <div style={{ ...bannerStyle, borderColor: "rgba(74,222,128,0.35)", background: "rgba(34,197,94,0.08)" }}>
            {autoHint}
          </div>
          {autoBanner ? (
            <div
              style={{
                marginBottom: 16,
                padding: "12px 16px",
                borderRadius: ui.radiusMd,
                border: "1px solid rgba(74,222,128,0.45)",
                background: "rgba(34,197,94,0.12)",
                color: "#bbf7d0",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {autoBanner}
            </div>
          ) : null}
          <div
            style={{
              borderRadius: ui.radiusMd,
              border: "1px solid rgba(74,222,128,0.35)",
              background: "rgba(34,197,94,0.06)",
              padding: isMobile ? 18 : 22,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "#86efac",
                marginBottom: 12,
              }}
            >
              {t.autoPreviewTitle}
            </div>
            <textarea readOnly value={suggested} style={{ ...inputBase(true), minHeight: 120, marginBottom: 14 }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button type="button" disabled={busy} onClick={() => void copy(suggested)} style={btnGhost(isMobile)}>
                {t.copyPreview}
              </button>
              <button type="button" disabled={busy} onClick={() => void simulateSend(suggested, false)} style={btnPrimary(isMobile)}>
                {busy ? t.simulating : t.simulateAutoAgain}
              </button>
            </div>
          </div>
        </>
      )}

      {lastSimulatedAt ? (
        <p style={{ margin: "18px 0 0", fontSize: 14, color: ui.faint }}>
          {t.lastSimulatedAt}{lastSimulatedAt}
        </p>
      ) : null}
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
  fontSize: 15,
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
  const show = t ? t : "—";
  return (
    <div style={{ gridColumn: span2 ? "1 / -1" : undefined, minWidth: 0 }}>
      <div
        style={{
          fontSize: 13,
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
          fontSize: 17,
          color: ui.text,
          lineHeight: multiline ? 1.7 : 1.45,
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
      <div style={{ fontSize: 13, fontWeight: 700, color: ui.faint, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: ui.text, wordBreak: "break-word" }}>
        {t ? t : "—"}
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
          fontSize: 13,
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
          fontSize: 17,
          lineHeight: 1.7,
          color: ui.text,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {t ? t : "—"}
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
        <span style={{ fontSize: 15, fontWeight: 600, color: ui.muted }}>{cfg.label}</span>
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
        <span style={{ fontSize: 15, fontWeight: 600, color: ui.muted }}>{cfg.label}</span>
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
      <span style={{ fontSize: 15, fontWeight: 600, color: ui.muted }}>{cfg.label}</span>
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
    fontSize: 17,
    fontFamily: ui.font,
    outline: "none",
    minWidth: 0,
    resize: multiline ? ("vertical" as const) : undefined,
    minHeight: multiline ? 112 : undefined,
  };
}
