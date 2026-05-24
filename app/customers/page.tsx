"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { CrmCustomerSearchToolbar } from "../components/CrmCustomerSearchToolbar";
import { getTaipeiTodayYmd, diffCalendarDaysYmd } from "../lib/followUpReminders";
import { formatWorkspaceDateTime } from "../lib/followUpWorkspace";
import { followUpModeBadgeMeta, normalizeFollowUpMode } from "../lib/followUpMode";
import {
  buildConversationSourceMap,
  resolveDisplayImportantDate,
  verifiedFollowUpYmdForFilter,
} from "../lib/crmCustomerDisplay";
import { CustomerInsightSections } from "../components/CustomerInsightSections";
import { useIsViewportBelow } from "../hooks/useViewportWidth";
import { useAppLang } from "../hooks/useAppLang";
import { customersListCopy } from "../lib/customersI18n";
import { translateDisplayValue } from "../lib/uiI18n";
import type { AppLang } from "../lib/appLang";
import {
  getRawCustomerStatus,
  normalizePipelineStatus,
  PIPELINE_STATUSES,
  pipelineStatusLabel,
  type PipelineStatus,
} from "../lib/pipelineStatus";
import PipelineStatusBadge from "../components/PipelineStatusBadge";
import {
  formatCustomerCreatedAtDisplay,
  getCustomerLastContactAt,
  restoreCustomerPayload,
  softDeleteCustomerPayload,
} from "../lib/customerSoftDelete";
import { companyIdHeader, logActiveCompany } from "../lib/clientCompany";
import { useActiveCompany } from "../components/ActiveCompanyProvider";
import { supabase } from "../../supabase";
import { showInternalCrmNav } from "../lib/crmNavVisibility";
import { normalizeLineIdForDisplay } from "../lib/lineIdDisplay";
import {
  CUSTOMER_SOCIAL_FIELD_KEYS,
  CUSTOMER_SOCIAL_LABELS_ZH,
  type CustomerSocialFieldKey,
} from "../lib/customerSocialMedia";

type StatusFilter = "all" | PipelineStatus;
type FollowFilter = "all" | "has_date" | "no_date" | "overdue" | "today" | "next7";
type UrgencyFilter =
  | "all"
  | "overdue_today"
  | "within3"
  | "within7"
  | "later"
  | "completed"
  | "none";

const CRM_MOBILE_MAX_WIDTH = 768;

function ChevronRightIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ViewDetailLink({
  href,
  label,
  fullWidth,
  cardHovered,
}: {
  href: string;
  label: string;
  fullWidth?: boolean;
  cardHovered?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: cardHovered
          ? "linear-gradient(135deg, #4ade80 0%, #22c55e 45%, #16a34a 100%)"
          : "linear-gradient(135deg, #34d399 0%, #22c55e 50%, #15803d 100%)",
        color: "white",
        textDecoration: "none",
        padding: fullWidth ? "13px 18px" : "11px 18px",
        borderRadius: 12,
        cursor: "pointer",
        fontWeight: 800,
        fontSize: fullWidth ? 15 : 14,
        width: fullWidth ? "100%" : "auto",
        boxSizing: "border-box",
        border: cardHovered
          ? "1px solid rgba(255,255,255,0.55)"
          : "1px solid rgba(255,255,255,0.28)",
        boxShadow: cardHovered
          ? "0 8px 28px rgba(74,222,128,0.55), 0 0 20px rgba(34,197,94,0.35)"
          : "0 6px 20px rgba(34,197,94,0.4)",
        flexShrink: 0,
        transform: cardHovered ? "scale(1.06) translateX(2px)" : "scale(1)",
        transition:
          "transform 0.22s cubic-bezier(0.34, 1.2, 0.64, 1), box-shadow 0.22s ease, background 0.22s ease, border-color 0.22s ease",
      }}
    >
      <span>{label}</span>
      <ChevronRightIcon size={cardHovered ? 20 : 18} />
    </Link>
  );
}

export default function CustomersPage() {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [socialDraft, setSocialDraft] = useState<Record<CustomerSocialFieldKey, string>>(() =>
    Object.fromEntries(CUSTOMER_SOCIAL_FIELD_KEYS.map((k) => [k, ""])) as Record<
      CustomerSocialFieldKey,
      string
    >,
  );
  const [newStatus, setNewStatus] = useState<PipelineStatus>("new_lead");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [followFilter, setFollowFilter] = useState<FollowFilter>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) setSearch(q);

    const focusSearch =
      params.get("focus") === "search" || params.get("crm") === "1";
    if (!focusSearch) return;

    const id = window.setTimeout(() => {
      searchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      searchInputRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(id);
  }, []);
  const [conversationSourceByCustomerId, setConversationSourceByCustomerId] = useState<
    Map<string, string>
  >(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchTrashModal, setBatchTrashModal] = useState<"permanent" | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [trashView, setTrashView] = useState(false);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  const { companyId, ready: companyReady } = useActiveCompany();

  const isMobile = useIsViewportBelow(CRM_MOBILE_MAX_WIDTH);
  const { lang } = useAppLang();
  const t = customersListCopy(lang);
  const displayValue = (value?: string | null) => {
    if (!value?.trim() || value.trim() === "-") return "-";
    return translateDisplayValue(value, lang);
  };

  useEffect(() => {
    if (!companyReady || companyId <= 0) return;
    void loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, companyReady, trashView]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadCustomers() {
    if (!companyReady || companyId <= 0) return;
    logActiveCompany("customersList.load", { companyId, trashView });

    const [customersRes, convosRes] = await Promise.all([
      fetch(`/api/customers?trash=${trashView ? "1" : "0"}`, {
        headers: companyIdHeader(),
        cache: "no-store",
      }).then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          rows?: unknown[];
          fetchedCount?: number;
          error?: string;
          companyId?: number;
        };
        return { res, json };
      }),
      supabase
        .from("conversations")
        .select("customer_id, message_text")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true })
        .limit(5000),
    ]);

    const fetchedCount = customersRes.json.fetchedCount ?? customersRes.json.rows?.length ?? 0;
    console.log("[customersList] fetch result:", {
      activeCompanyId: companyId,
      trashView,
      httpOk: customersRes.res.ok,
      customersFetchedCount: fetchedCount,
      apiCompanyId: customersRes.json.companyId,
      error: customersRes.json.error ?? null,
    });

    if (customersRes.res.ok && customersRes.json.ok && Array.isArray(customersRes.json.rows)) {
      setCustomers(customersRes.json.rows);
    } else {
      console.error("[customersList] fetch failed — clearing list:", customersRes.json.error);
      setCustomers([]);
    }

    if (!convosRes.error && convosRes.data) {
      setConversationSourceByCustomerId(buildConversationSourceMap(convosRes.data));
      console.log("[customersList] conversations loaded (optional enrichment):", {
        conversationRows: convosRes.data.length,
        customersWithConversationText: convosRes.data.length,
      });
    } else {
      setConversationSourceByCustomerId(new Map());
      if (convosRes.error) {
        console.warn("[customersList] conversations fetch failed (list still shown):", convosRes.error.message);
      }
    }
  }

  async function handleAddCustomer() {
    alert("客戶新增已暫停（除首頁「儲存至客戶資料表」外）。請使用首頁客戶分析後儲存。");
  }

  async function moveCustomerToTrash(id: number | string) {
    const ok = confirm(t.confirmDelete);
    if (!ok) return;

    const { error } = await supabase
      .from("customers")
      .update(softDeleteCustomerPayload())
      .eq("company_id", companyId)
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadCustomers();
  }

  async function restoreCustomer(id: number | string) {
    const ok = confirm(t.confirmRestore);
    if (!ok) return;

    const { error } = await supabase
      .from("customers")
      .update(restoreCustomerPayload())
      .eq("company_id", companyId)
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadCustomers();
  }

  async function permanentlyDeleteCustomer(id: number | string) {
    const ok = confirm(t.confirmPermanentDelete);
    if (!ok) return;

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("company_id", companyId)
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadCustomers();
  }

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const todayYmd = getTaipeiTodayYmd();

    const filtered = customers.filter((c) => {
      if (keyword) {
        const haystack = [
          c.customer_name,
          c.company_name,
          c.phone,
          c.line_id,
          c.email,
          c.note,
          c.instagram,
          c.facebook,
          c.tiktok,
          c.xiaohongshu,
          c.youtube,
          c.website,
          c.alternate_contact,
        ]
          .map((v) => (v || "").toString().toLowerCase())
          .join(" ");
        if (!haystack.includes(keyword)) return false;
      }

      if (trashView) return true;

      if (statusFilter !== "all") {
        const s = normalizePipelineStatus(getRawCustomerStatus(c));
        if (s !== statusFilter) return false;
      }

      const sourceText = conversationSourceByCustomerId.get(String(c.id)) ?? "";
      const followYmd = verifiedFollowUpYmdForFilter(c.follow_up_date, sourceText);
      const dayDiff = followYmd ? diffCalendarDaysYmd(todayYmd, followYmd) : null;

      if (followFilter !== "all") {
        if (followFilter === "has_date" && !followYmd) return false;
        if (followFilter === "no_date" && followYmd) return false;
        if (followFilter === "overdue" && (dayDiff == null || dayDiff >= 0)) return false;
        if (followFilter === "today" && dayDiff !== 0) return false;
        if (followFilter === "next7" && (dayDiff == null || dayDiff < 1 || dayDiff > 7)) return false;
      }

      if (urgencyFilter !== "all") {
        if (urgencyFilter === "none" && followYmd) return false;
        if (urgencyFilter === "completed") {
          const s = normalizePipelineStatus(getRawCustomerStatus(c));
          if (s !== "completed" && s !== "cancelled" && s !== "invalid") return false;
        }
        if (urgencyFilter === "overdue_today" && (dayDiff == null || dayDiff > 0)) return false;
        if (urgencyFilter === "within3" && (dayDiff == null || dayDiff > 3)) return false;
        if (urgencyFilter === "within7" && (dayDiff == null || dayDiff > 7)) return false;
        if (urgencyFilter === "later" && (dayDiff == null || dayDiff <= 7)) return false;
      }

      return true;
    });

    return filtered;
  }, [
    customers,
    search,
    trashView,
    statusFilter,
    followFilter,
    urgencyFilter,
    conversationSourceByCustomerId,
  ]);

  useEffect(() => {
    if (!companyReady) return;
    console.log("[customersList] render stats:", {
      activeCompanyId: companyId,
      customersFetchedCount: customers.length,
      filteredCount: filteredCustomers.length,
      finalRenderedCount: filteredCustomers.length,
      trashView,
      statusFilter,
      followFilter,
      urgencyFilter,
      search: search.trim() || null,
    });
  }, [
    companyReady,
    companyId,
    customers.length,
    filteredCustomers.length,
    trashView,
    statusFilter,
    followFilter,
    urgencyFilter,
    search,
  ]);

  const filteredIds = useMemo(
    () => filteredCustomers.map((c) => String(c.id)),
    [filteredCustomers],
  );

  const selectedCount = selectedIds.size;

  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  const someFilteredSelected = filteredIds.some((id) => selectedIds.has(id));

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected =
        filteredIds.length > 0 && filteredIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        for (const id of filteredIds) next.delete(id);
      } else {
        for (const id of filteredIds) next.add(id);
      }
      return next;
    });
  }, [filteredIds]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  async function confirmBatchDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !companyReady || companyId <= 0) return;

    setBatchDeleting(true);
    const { error } = await supabase
      .from("customers")
      .update(softDeleteCustomerPayload())
      .eq("company_id", companyId)
      .in("id", ids);

    setBatchDeleting(false);
    setBatchDeleteOpen(false);

    if (error) {
      alert(error.message);
      return;
    }

    const n = ids.length;
    setSelectedIds(new Set());
    setToast(t.batchDeleteSuccess(n));
    await loadCustomers();
  }

  async function confirmBatchRestore() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !companyReady || companyId <= 0) return;

    setBatchDeleting(true);
    const { error } = await supabase
      .from("customers")
      .update(restoreCustomerPayload())
      .eq("company_id", companyId)
      .in("id", ids);

    setBatchDeleting(false);
    setBatchTrashModal(null);

    if (error) {
      alert(error.message);
      return;
    }

    const n = ids.length;
    setSelectedIds(new Set());
    setToast(t.batchRestoreSuccess(n));
    await loadCustomers();
  }

  async function confirmBatchPermanentDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !companyReady || companyId <= 0) return;

    setBatchDeleting(true);
    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("company_id", companyId)
      .in("id", ids);

    setBatchDeleting(false);
    setBatchTrashModal(null);

    if (error) {
      alert(error.message);
      return;
    }

    const n = ids.length;
    setSelectedIds(new Set());
    setToast(t.batchPermanentDeleteSuccess(n));
    await loadCustomers();
  }

  function exitTrashView() {
    setTrashView(false);
    setSelectedIds(new Set());
    setBatchTrashModal(null);
    setSearch("");
  }

  function enterTrashView() {
    setTrashView(true);
    setSelectedIds(new Set());
    setBatchTrashModal(null);
    setSearch("");
    setStatusFilter("all");
    setFollowFilter("all");
    setUrgencyFilter("all");
  }

  const font =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg,#001133 0%,#001a44 40%,#003b46 100%)",
        padding: isMobile ? 20 : 40,
        color: "white",
        fontFamily: font,
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "flex-start" : "center",
          flexDirection: isMobile ? "column" : "row",
          gap: 22,
          marginBottom: isMobile ? 36 : 44,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: isMobile ? 40 : 56,
              margin: 0,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            {trashView ? t.trashTitle : t.title}
          </h1>

          <p
            style={{
              opacity: 0.82,
              marginTop: 14,
              fontSize: isMobile ? 16 : 18,
              lineHeight: 1.55,
            }}
          >
            {trashView
              ? t.trashCount(filteredCustomers.length)
              : t.count(customers.length, filteredCustomers.length)}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            flexDirection: isMobile ? "column" : "row",
            width: isMobile ? "100%" : "auto",
          }}
        >
          {trashView ? (
            <button
              type="button"
              onClick={exitTrashView}
              style={{
                background: "#6366f1",
                color: "white",
                border: "none",
                padding: isMobile ? "15px 20px" : "15px 26px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 16,
                width: isMobile ? "100%" : "auto",
              }}
            >
              {t.exitTrash}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={enterTrashView}
                style={{
                  background: "#1a3557",
                  color: "#e2e8f0",
                  border: "1px solid rgba(148,163,184,0.35)",
                  padding: isMobile ? "15px 20px" : "15px 26px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 16,
                  width: isMobile ? "100%" : "auto",
                }}
              >
                {t.trash}
              </button>
              {showInternalCrmNav() ? (
                <Link
                  href="/pipeline"
                  style={{ width: isMobile ? "100%" : "auto" }}
                >
                  <button
                    style={{
                      background: "#6366f1",
                      color: "white",
                      border: "none",
                      padding: isMobile ? "15px 20px" : "15px 26px",
                      borderRadius: 12,
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 16,
                      width: isMobile ? "100%" : "auto",
                    }}
                  >
                    {t.openPipeline}
                  </button>
                </Link>
              ) : null}
            </>
          )}
          <Link href="/dashboard" style={{ width: isMobile ? "100%" : "auto" }}>
            <button
              style={{
                background: "#102742",
                color: "white",
                border: "none",
                padding: isMobile ? "15px 20px" : "15px 26px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 16,
                width: isMobile ? "100%" : "auto",
              }}
            >
              {t.backHome}
            </button>
          </Link>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: isMobile ? 28 : 36,
          alignItems: "flex-start",
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <div style={{ flex: 1, width: "100%", minWidth: 0 }}>
          <CrmCustomerSearchToolbar
            lang={lang}
            isMobile={isMobile}
            trashView={trashView}
            search={search}
            onSearchChange={setSearch}
            searchInputRef={searchInputRef}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            followFilter={followFilter}
            onFollowFilterChange={setFollowFilter}
            urgencyFilter={urgencyFilter}
            onUrgencyFilterChange={setUrgencyFilter}
          />

          {selectedCount > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                marginBottom: 20,
                padding: isMobile ? "14px 16px" : "16px 20px",
                borderRadius: 14,
                background: trashView
                  ? "rgba(34,197,94,0.12)"
                  : "rgba(99,102,241,0.18)",
                border: trashView
                  ? "1px solid rgba(74,222,128,0.45)"
                  : "1px solid rgba(129,140,248,0.45)",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700 }}>{t.selectedCount(selectedCount)}</span>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  width: isMobile ? "100%" : "auto",
                }}
              >
                {trashView ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(t.batchRestoreConfirm(selectedCount))) {
                          void confirmBatchRestore();
                        }
                      }}
                      disabled={batchDeleting}
                      style={{
                        background: "#22c55e",
                        color: "white",
                        border: "none",
                        padding: "12px 22px",
                        borderRadius: 12,
                        cursor: batchDeleting ? "wait" : "pointer",
                        fontWeight: 700,
                        fontSize: 16,
                        opacity: batchDeleting ? 0.75 : 1,
                        flex: isMobile ? "1 1 auto" : undefined,
                      }}
                    >
                      {batchDeleting ? t.batchProcessing : t.batchRestore}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchTrashModal("permanent")}
                      disabled={batchDeleting}
                      style={{
                        background: "#ef4444",
                        color: "white",
                        border: "none",
                        padding: "12px 22px",
                        borderRadius: 12,
                        cursor: batchDeleting ? "wait" : "pointer",
                        fontWeight: 700,
                        fontSize: 16,
                        opacity: batchDeleting ? 0.75 : 1,
                        flex: isMobile ? "1 1 auto" : undefined,
                      }}
                    >
                      {t.batchPermanentDelete}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setBatchDeleteOpen(true)}
                    disabled={batchDeleting}
                    style={{
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      padding: "12px 22px",
                      borderRadius: 12,
                      cursor: batchDeleting ? "wait" : "pointer",
                      fontWeight: 700,
                      fontSize: 16,
                      opacity: batchDeleting ? 0.75 : 1,
                      width: isMobile ? "100%" : "auto",
                    }}
                  >
                    {t.batchDelete}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 18,
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(8,27,51,0.65)",
              border: "1px solid rgba(148,163,184,0.2)",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: filteredIds.length === 0 ? "not-allowed" : "pointer",
                fontSize: 15,
                fontWeight: 600,
                opacity: filteredIds.length === 0 ? 0.5 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={allFilteredSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                }}
                disabled={filteredIds.length === 0}
                onChange={toggleSelectAll}
                style={{ width: 18, height: 18, accentColor: "#6366f1", cursor: "inherit" }}
              />
              {t.selectAllShown(filteredIds.length)}
            </label>
            {someFilteredSelected ? (
              <button
                type="button"
                onClick={deselectAll}
                disabled={batchDeleting}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#e2e8f0",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: batchDeleting ? "wait" : "pointer",
                }}
              >
                {t.deselectAll}
              </button>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 28,
            }}
          >
            {filteredCustomers.map((c) => {
              const rowId = String(c.id);
              const isSelected = selectedIds.has(rowId);
              const isHovered = !trashView && hoveredCardId === rowId;
              const detailHref = `/customers/${c.id}`;
              return (
              <div
                key={c.id}
                onMouseEnter={() => !trashView && setHoveredCardId(rowId)}
                onMouseLeave={() => setHoveredCardId(null)}
            style={{
              background: isHovered ? "#123052" : "#102742",
              borderRadius: 24,
              padding: isMobile ? 24 : 36,
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
              minWidth: 0,
              position: "relative",
              border: isSelected
                ? "2px solid rgba(167,139,250,0.95)"
                : isHovered
                  ? "2px solid rgba(167,139,250,0.85)"
                  : "2px solid rgba(148,163,184,0.2)",
              boxShadow: isSelected
                ? "0 0 0 1px rgba(167,139,250,0.4), 0 20px 48px rgba(99,102,241,0.45), 0 0 32px rgba(129,140,248,0.35)"
                : isHovered
                  ? "0 0 0 1px rgba(167,139,250,0.35), 0 22px 52px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.42), 0 0 80px rgba(129,140,248,0.18)"
                  : "0 4px 18px rgba(0,0,0,0.22)",
              transform: isHovered ? "translateY(-6px) scale(1.015)" : "translateY(0) scale(1)",
              cursor: "default",
              transition:
                "border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.2, 0.64, 1), background 0.25s ease",
            }}
              >
                <div
                  style={{
                    position: "relative",
                    marginBottom: 26,
                  }}
                >
                  {!trashView ? (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        zIndex: 3,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 8,
                        maxWidth: isMobile ? "min(100%, 200px)" : "none",
                        pointerEvents: "auto",
                      }}
                    >
                      <ViewDetailLink
                        href={detailHref}
                        label={t.viewDetail}
                        fullWidth={isMobile}
                        cardHovered={isHovered}
                      />
                      <span
                        style={{
                          fontSize: isMobile ? 12 : 13,
                          fontWeight: 600,
                          color: isHovered ? "rgba(196,181,253,0.95)" : "rgba(148,163,184,0.7)",
                          opacity: isHovered ? 1 : isMobile ? 0.72 : 0,
                          maxHeight: isHovered || isMobile ? 28 : 0,
                          overflow: "hidden",
                          transition: "opacity 0.25s ease, max-height 0.25s ease, color 0.25s ease",
                          cursor: "default",
                          textAlign: "right",
                          lineHeight: 1.35,
                          whiteSpace: isMobile ? "normal" : "nowrap",
                        }}
                      >
                        {t.clickCardHint}
                      </span>
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "flex-start",
                      minWidth: 0,
                      paddingRight: !trashView ? (isMobile ? 0 : 168) : 0,
                      paddingTop: isMobile && !trashView ? 52 : 0,
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        paddingTop: 6,
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          toggleSelect(rowId, e.target.checked)
                        }
                        style={{ width: 20, height: 20, accentColor: "#6366f1" }}
                      />
                    </label>
                    <div style={{ minWidth: 0 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: isMobile ? 32 : 44,
                        fontWeight: 700,
                        letterSpacing: "-0.02em",
                        lineHeight: 1.2,
                      }}
                    >
                      {c.customer_name || t.unnamed}
                    </h2>

                    <div
                      style={{
                        marginTop: 18,
                        lineHeight: 2,
                        opacity: 0.92,
                        fontSize: isMobile ? 16 : 17,
                      }}
                    >
                      <div>{t.company}：{c.company_name || "-"}</div>
                      <div>{t.phone}：{c.phone || "-"}</div>
                      <div>
                        {t.lineId}：{normalizeLineIdForDisplay(c.line_id) || "-"}
                      </div>
                      <div>{t.email}：{c.email || "-"}</div>
                      {(() => {
                        const createdLabel = formatCustomerCreatedAtDisplay(c.created_at, lang);
                        const lastAt = getCustomerLastContactAt(c);
                        return (
                          <>
                            {createdLabel ? (
                              <div>
                                {t.createdAtLabel}：{createdLabel}
                              </div>
                            ) : null}
                            <div>
                              {t.lastContactLabel}：
                              {lastAt ? formatWorkspaceDateTime(lastAt, lang) : "—"}
                            </div>
                          </>
                        );
                      })()}
                      {trashView && c.deleted_at ? (
                        <div style={{ opacity: 0.85 }}>
                          {t.deletedAtLabel}：
                          {formatCustomerCreatedAtDisplay(c.deleted_at, lang) || "-"}
                        </div>
                      ) : null}
                    </div>
                    </div>
                  </div>

                  {!trashView ? (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      justifyContent: "flex-start",
                      marginTop: isMobile ? 14 : 16,
                    }}
                  >
                      <PipelineStatusBadge status={c.status} lang={lang} />
                      {(() => {
                        const mode = normalizeFollowUpMode(c.follow_up_mode);
                        const mm = followUpModeBadgeMeta(mode, lang);
                        return (
                          <span
                            title={mm.subtitle}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 999,
                              fontSize: 14,
                              fontWeight: 700,
                              background: mm.bg,
                              color: mm.color,
                              border: `1px solid ${mm.border}`,
                            }}
                          >
                            {mm.label}
                          </span>
                        );
                      })()}
                      <div
                        style={{
                          background: "#1a3557",
                          padding: "10px 16px",
                          borderRadius: 999,
                          fontSize: 15,
                          fontWeight: 600,
                        }}
                      >
                        {displayValue(c.customer_level) === "-" ? t.unknown : displayValue(c.customer_level)}
                      </div>
                  </div>
                  ) : null}
                </div>

                {!trashView && (() => {
                  const sourceText = conversationSourceByCustomerId.get(String(c.id)) ?? "";
                  const importantDisplay = resolveDisplayImportantDate(
                    sourceText,
                    lang,
                    new Date(),
                    c.important_date,
                  );
                  return (
                    <div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile
                            ? "1fr"
                            : "1fr 1fr",
                          gap: isMobile ? 16 : 22,
                          marginBottom: 4,
                          fontSize: isMobile ? 15 : 16,
                          lineHeight: 1.55,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div>
                            <span style={{ color: "rgba(226,232,240,0.75)", fontWeight: 600 }}>
                              {t.customerNeed}：
                            </span>{" "}
                            {displayValue(c.customer_need)}
                          </div>
                          <div>
                            <span style={{ color: "rgba(226,232,240,0.75)", fontWeight: 600 }}>
                              {t.customerEmotion}：
                            </span>{" "}
                            {displayValue(c.customer_emotion)}
                          </div>
                          {importantDisplay ? (
                            <div>
                              <span style={{ color: "rgba(226,232,240,0.75)", fontWeight: 600 }}>
                                {t.importantDate}：
                              </span>{" "}
                              {importantDisplay}
                            </div>
                          ) : null}
                          <div>
                            <span style={{ color: "rgba(226,232,240,0.75)", fontWeight: 600 }}>
                              {t.nextStep}：
                            </span>{" "}
                            {displayValue(c.next_step)}
                          </div>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div>
                            <span style={{ color: "rgba(226,232,240,0.75)", fontWeight: 600 }}>
                              {t.estimatedAmount}：
                            </span>{" "}
                            {displayValue(c.estimated_amount)}
                          </div>
                          <div>
                            <span style={{ color: "rgba(226,232,240,0.75)", fontWeight: 600 }}>
                              {t.dealProbability}：
                            </span>{" "}
                            {displayValue(c.success_rate)}
                          </div>
                          <div>
                            <span style={{ color: "rgba(226,232,240,0.75)", fontWeight: 600 }}>
                              {t.churnRisk}：
                            </span>{" "}
                            {displayValue(c.churn_risk)}
                          </div>
                        </div>
                      </div>

                      <CustomerInsightSections
                        lang={lang}
                        sourceText={sourceText}
                        labels={{
                          todo: t.todo,
                          replySuggestion: t.replySuggestion,
                          followUp: t.followUp,
                          aiSend: t.aiSend,
                          note: t.note,
                          noExplicitDate: t.noExplicitDate,
                          importantDate: t.importantDate,
                        }}
                        todo={c.todo}
                        reply_suggestion={c.reply_suggestion}
                        follow_up={c.follow_up}
                        follow_up_mode={c.follow_up_mode}
                        note={c.note}
                        showFollowUpReminder={false}
                        clampLongText
                      />
                    </div>
                  );
                })()}

                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    marginTop: 32,
                    flexDirection: isMobile ? "column" : "row",
                  }}
                >
                  {trashView ? (
                    <>
                      <button
                        type="button"
                        onClick={() => restoreCustomer(c.id)}
                        style={{
                          background: "#22c55e",
                          color: "white",
                          border: "none",
                          padding: "15px 22px",
                          borderRadius: 12,
                          cursor: "pointer",
                          fontWeight: 700,
                          fontSize: 16,
                          width: isMobile ? "100%" : "auto",
                        }}
                      >
                        {t.restoreCustomer}
                      </button>
                      <button
                        type="button"
                        onClick={() => permanentlyDeleteCustomer(c.id)}
                        style={{
                          background: "#ef4444",
                          color: "white",
                          border: "none",
                          padding: "15px 22px",
                          borderRadius: 12,
                          cursor: "pointer",
                          fontWeight: 700,
                          fontSize: 16,
                          width: isMobile ? "100%" : "auto",
                        }}
                      >
                        {t.permanentDelete}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => moveCustomerToTrash(c.id)}
                        style={{
                          background: "#ef4444",
                          color: "white",
                          border: "none",
                          padding: "15px 22px",
                          borderRadius: 12,
                          cursor: "pointer",
                          fontWeight: 700,
                          fontSize: 16,
                          width: isMobile ? "100%" : "auto",
                        }}
                      >
                        {t.deleteCustomer}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
            })}
          </div>
        </div>

        {!trashView ? (
        <div
          style={{
            width: isMobile ? "100%" : 340,
            background: "#081b33",
            padding: isMobile ? 22 : 26,
            borderRadius: 20,
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: 22,
              fontSize: isMobile ? 26 : 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {t.addCustomer}
          </h3>

          <input
            placeholder={t.namePlaceholder}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            style={{
              width: "100%",
              padding: "15px 16px",
              marginBottom: 14,
              borderRadius: 10,
              border: "none",
              background: "#102742",
              color: "white",
              boxSizing: "border-box",
              fontSize: 17,
            }}
          />

          <input
            placeholder={t.companyPlaceholder}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            style={{
              width: "100%",
              padding: "15px 16px",
              marginBottom: 14,
              borderRadius: 10,
              border: "none",
              background: "#102742",
              color: "white",
              boxSizing: "border-box",
              fontSize: 17,
            }}
          />

          <input
            placeholder={t.phonePlaceholder}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{
              width: "100%",
              padding: "15px 16px",
              marginBottom: 14,
              borderRadius: 10,
              border: "none",
              background: "#102742",
              color: "white",
              boxSizing: "border-box",
              fontSize: 17,
            }}
          />

          <p
            style={{
              margin: "8px 0 10px",
              fontSize: 13,
              fontWeight: 700,
              color: "rgba(226,232,240,0.85)",
              letterSpacing: "0.04em",
            }}
          >
            社群媒體
          </p>

          {CUSTOMER_SOCIAL_FIELD_KEYS.map((key) => {
            const placeholderMap: Record<CustomerSocialFieldKey, string> = {
              instagram: t.instagramPlaceholder,
              facebook: t.facebookPlaceholder,
              tiktok: t.tiktokPlaceholder,
              xiaohongshu: t.xiaohongshuPlaceholder,
              youtube: t.youtubePlaceholder,
              website: t.websitePlaceholder,
              alternate_contact: t.alternateContactPlaceholder,
            };
            return (
              <input
                key={key}
                aria-label={CUSTOMER_SOCIAL_LABELS_ZH[key]}
                placeholder={placeholderMap[key]}
                value={socialDraft[key]}
                onChange={(e) =>
                  setSocialDraft((prev) => ({ ...prev, [key]: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "13px 16px",
                  marginBottom: 10,
                  borderRadius: 10,
                  border: "none",
                  background: "#102742",
                  color: "white",
                  boxSizing: "border-box",
                  fontSize: 15,
                }}
              />
            );
          })}

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "rgba(226,232,240,0.7)",
              }}
            >
              {t.salesStatus}
            </span>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as PipelineStatus)}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 10,
                border: "none",
                background: "#102742",
                color: "white",
                boxSizing: "border-box",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              {PIPELINE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {pipelineStatusLabel(s, lang)}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={handleAddCustomer}
            style={{
              width: "100%",
              background: "#facc15",
              color: "black",
              border: "none",
              padding: "16px 14px",
              borderRadius: 10,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 17,
            }}
          >
            {t.addCustomerBtn}
          </button>
        </div>
        ) : null}
      </div>

      {batchTrashModal === "permanent" ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(2,8,23,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            boxSizing: "border-box",
          }}
          onClick={() => !batchDeleting && setBatchTrashModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-permanent-delete-title"
            style={{
              width: "min(440px, 100%)",
              background: "#102742",
              borderRadius: 16,
              border: "1px solid rgba(148,163,184,0.35)",
              padding: isMobile ? 22 : 28,
              boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="batch-permanent-delete-title"
              style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 700, lineHeight: 1.35 }}
            >
              {t.batchPermanentDeleteConfirmTitle}
            </h2>
            <p style={{ margin: "0 0 24px", fontSize: 15, lineHeight: 1.55, opacity: 0.88 }}>
              {t.batchPermanentDeleteConfirmBody}
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                flexDirection: isMobile ? "column-reverse" : "row",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                disabled={batchDeleting}
                onClick={() => setBatchTrashModal(null)}
                style={{
                  padding: "12px 20px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.4)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: batchDeleting ? "wait" : "pointer",
                }}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={batchDeleting}
                onClick={() => void confirmBatchPermanentDelete()}
                style={{
                  padding: "12px 20px",
                  borderRadius: 12,
                  border: "none",
                  background: "#ef4444",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 16,
                  cursor: batchDeleting ? "wait" : "pointer",
                  opacity: batchDeleting ? 0.8 : 1,
                }}
              >
                {batchDeleting ? t.batchProcessing : t.confirmBatchPermanentDelete}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {batchDeleteOpen ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(2,8,23,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            boxSizing: "border-box",
          }}
          onClick={() => !batchDeleting && setBatchDeleteOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-delete-title"
            style={{
              width: "min(440px, 100%)",
              background: "#102742",
              borderRadius: 16,
              border: "1px solid rgba(148,163,184,0.35)",
              padding: isMobile ? 22 : 28,
              boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="batch-delete-title"
              style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 700, lineHeight: 1.35 }}
            >
              {t.batchDeleteConfirmTitle}
            </h2>
            <p style={{ margin: "0 0 24px", fontSize: 15, lineHeight: 1.55, opacity: 0.88 }}>
              {t.batchDeleteConfirmBody}
            </p>
            <div
              style={{
                display: "flex",
                gap: 12,
                flexDirection: isMobile ? "column-reverse" : "row",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                disabled={batchDeleting}
                onClick={() => setBatchDeleteOpen(false)}
                style={{
                  padding: "12px 20px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.4)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: batchDeleting ? "wait" : "pointer",
                }}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={batchDeleting}
                onClick={() => void confirmBatchDelete()}
                style={{
                  padding: "12px 20px",
                  borderRadius: 12,
                  border: "none",
                  background: "#ef4444",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 16,
                  cursor: batchDeleting ? "wait" : "pointer",
                  opacity: batchDeleting ? 0.8 : 1,
                }}
              >
                {batchDeleting ? t.batchDeleting : t.confirmBatchDelete}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            zIndex: 10001,
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
    </main>
  );
}