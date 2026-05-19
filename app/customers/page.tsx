"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  formatFollowUpDateDisplay,
  getFollowUpBadge,
  getTaipeiTodayYmd,
  diffCalendarDaysYmd,
  normalizeFollowUpDateValue,
  type FollowUpBadge,
} from "../lib/followUpReminders";
import { followUpModeBadgeMeta, normalizeFollowUpMode } from "../lib/followUpMode";
import { useIsViewportBelow } from "../hooks/useViewportWidth";
import { useAppLang } from "../hooks/useAppLang";
import { customersListCopy, followUpBadgeLabelForLang } from "../lib/customersI18n";
import { translateDisplayValue } from "../lib/uiI18n";
import type { AppLang } from "../lib/appLang";
import {
  normalizePipelineStatus,
  PIPELINE_STATUSES,
  pipelineStatusLabel,
  type PipelineStatus,
} from "../lib/pipelineStatus";
import PipelineStatusBadge from "../components/PipelineStatusBadge";
import { supabase } from "../../supabase";

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

const filterSelectStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#102742",
  color: "white",
  fontSize: 15,
  fontWeight: 600,
};

function FilterColumn({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "rgba(226,232,240,0.75)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function crmFollowUpBadgeLook(
  badge: FollowUpBadge,
  lang: AppLang,
): { bg: string; color: string; border: string; label: string } {
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
      return { bg: "transparent", color: "#fff", border: "transparent", label: "" };
  }
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [newStatus, setNewStatus] = useState<PipelineStatus>("new_lead");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [followFilter, setFollowFilter] = useState<FollowFilter>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");

  const isMobile = useIsViewportBelow(CRM_MOBILE_MAX_WIDTH);
  const { lang } = useAppLang();
  const t = customersListCopy(lang);
  const displayValue = (value?: string | null) => {
    if (!value?.trim() || value.trim() === "-") return "-";
    return translateDisplayValue(value, lang);
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("id", { ascending: false });

    if (!error && data) {
      setCustomers(data);
    }
  }

  async function handleAddCustomer() {
    if (!customerName.trim()) {
      alert(t.enterName);
      return;
    }

    const { error } = await supabase.from("customers").insert([
      {
        customer_name: customerName,
        company_name: companyName,
        phone: phone,
        status: newStatus,
      },
    ]);

    if (error) {
      alert(error.message);
      return;
    }

    alert(t.addSuccess);

    setCustomerName("");
    setCompanyName("");
    setPhone("");
    setNewStatus("new_lead");

    loadCustomers();
  }

  async function deleteCustomer(id: number) {
    const ok = confirm(t.confirmDelete);

    if (!ok) return;

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    loadCustomers();
  }

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const todayYmd = getTaipeiTodayYmd();

    return customers.filter((c) => {
      if (keyword) {
        const haystack = [
          c.customer_name,
          c.company_name,
          c.phone,
          c.line_id,
          c.email,
        ]
          .map((v) => (v || "").toString().toLowerCase())
          .join(" ");
        if (!haystack.includes(keyword)) return false;
      }

      if (statusFilter !== "all") {
        const s = normalizePipelineStatus(c.status);
        if (s !== statusFilter) return false;
      }

      const followYmd = normalizeFollowUpDateValue(c.follow_up_date);
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
          const s = normalizePipelineStatus(c.status);
          if (s !== "won" && s !== "lost") return false;
        }
        if (urgencyFilter === "overdue_today" && (dayDiff == null || dayDiff > 0)) return false;
        if (urgencyFilter === "within3" && (dayDiff == null || dayDiff > 3)) return false;
        if (urgencyFilter === "within7" && (dayDiff == null || dayDiff > 7)) return false;
        if (urgencyFilter === "later" && (dayDiff == null || dayDiff <= 7)) return false;
      }

      return true;
    });
  }, [customers, search, statusFilter, followFilter, urgencyFilter]);

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
            {t.title}
          </h1>

          <p
            style={{
              opacity: 0.82,
              marginTop: 14,
              fontSize: isMobile ? 16 : 18,
              lineHeight: 1.55,
            }}
          >
            {t.count(customers.length, filteredCustomers.length)}
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
          <Link href="/" style={{ width: isMobile ? "100%" : "auto" }}>
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
          <input
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "18px 20px",
              borderRadius: 14,
              border: "none",
              marginBottom: 16,
              background: "#102742",
              color: "white",
              fontSize: 17,
              boxSizing: "border-box",
            }}
          />

          <div
            style={{
              background: "#081b33",
              border: "1px solid rgba(148,163,184,0.18)",
              padding: isMobile ? 16 : 18,
              borderRadius: 14,
              marginBottom: 28,
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <FilterColumn label={t.filterStatus}>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                style={filterSelectStyle}
              >
                <option value="all">{t.filterAll}</option>
                {PIPELINE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {pipelineStatusLabel(s, lang)}
                  </option>
                ))}
              </select>
            </FilterColumn>
            <FilterColumn label={t.filterFollowUp}>
              <select
                value={followFilter}
                onChange={(e) => setFollowFilter(e.target.value as FollowFilter)}
                style={filterSelectStyle}
              >
                <option value="all">{t.filterAll}</option>
                <option value="has_date">{t.filterFollowHasDate}</option>
                <option value="no_date">{t.filterFollowNoDate}</option>
                <option value="overdue">{t.filterFollowOverdue}</option>
                <option value="today">{t.filterFollowToday}</option>
                <option value="next7">{t.filterFollowNext7}</option>
              </select>
            </FilterColumn>
            <FilterColumn label={t.filterUrgency}>
              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value as UrgencyFilter)}
                style={filterSelectStyle}
              >
                <option value="all">{t.filterAll}</option>
                <option value="overdue_today">{t.filterUrgencyOverdueToday}</option>
                <option value="within3">{t.filterUrgencyWithin3}</option>
                <option value="within7">{t.filterUrgencyWithin7}</option>
                <option value="later">{t.filterUrgencyLater}</option>
                <option value="completed">{t.filterUrgencyCompleted}</option>
                <option value="none">{t.filterUrgencyNone}</option>
              </select>
            </FilterColumn>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 28,
            }}
          >
            {filteredCustomers.map((c) => (
              <div
                key={c.id}
            style={{
              background: "#102742",
              borderRadius: 24,
              padding: isMobile ? 24 : 36,
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
              minWidth: 0,
            }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: isMobile ? "flex-start" : "center",
                    flexDirection: isMobile ? "column" : "row",
                    gap: 18,
                    marginBottom: 26,
                  }}
                >
                  <div>
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
                      <div>LINE：{c.line_id || "-"}</div>
                      <div>Email：{c.email || "-"}</div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: isMobile ? "stretch" : "flex-end",
                      gap: 10,
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        justifyContent: isMobile ? "flex-start" : "flex-end",
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
                      {(() => {
                        const fd = normalizeFollowUpDateValue(c.follow_up_date);
                        if (!fd) return null;
                        const b = getFollowUpBadge(fd);
                        if (b === "none") return null;
                        const look = crmFollowUpBadgeLook(b, lang);
                        return (
                          <span
                            title={t.followUpTitle(formatFollowUpDateDisplay(fd, lang))}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 999,
                              fontSize: 14,
                              fontWeight: 700,
                              background: look.bg,
                              color: look.color,
                              border: `1px solid ${look.border}`,
                            }}
                          >
                            {look.label} · {formatFollowUpDateDisplay(fd, lang)}
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
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : "1fr 1fr",
                    gap: 26,
                  }}
                >
                  <div
                    style={{
                      lineHeight: 2.05,
                      fontSize: isMobile ? 16 : 17,
                    }}
                  >
                    <div>
                      {t.customerNeed}：{displayValue(c.customer_need)}
                    </div>
                    <div>
                      {t.customerEmotion}：{displayValue(c.customer_emotion)}
                    </div>
                    <div>
                      {t.importantDate}：{displayValue(c.important_date)}
                    </div>
                    <div>
                      {t.nextStep}：{displayValue(c.next_step)}
                    </div>
                  </div>

                  <div
                    style={{
                      lineHeight: 2.05,
                      fontSize: isMobile ? 16 : 17,
                    }}
                  >
                    <div>
                      {t.estimatedAmount}：{displayValue(c.estimated_amount)}
                    </div>
                    <div>
                      {t.dealProbability}：{displayValue(c.success_rate)}
                    </div>
                    <div>
                      {t.churnRisk}：{displayValue(c.churn_risk)}
                    </div>
                    <div>
                      {t.todo}：{displayValue(c.todo)}
                    </div>
                    <div>
                      {t.replySuggestion}：{displayValue(c.reply_suggestion)}
                    </div>
                    <div>
                      {t.followUp}：{displayValue(c.follow_up)}
                    </div>
                    <div>
                      {t.aiSend}：
                      {followUpModeBadgeMeta(normalizeFollowUpMode(c.follow_up_mode), lang).label}
                    </div>
                    <div>
                      {t.followUpReminder}：
                      {(() => {
                        const norm = normalizeFollowUpDateValue(c.follow_up_date);
                        return norm
                          ? `${formatFollowUpDateDisplay(norm, lang)} (${norm})`
                          : "-";
                      })()}
                    </div>
                    <div>{t.note}：{c.note || "-"}</div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    marginTop: 32,
                    flexDirection: isMobile ? "column" : "row",
                  }}
                >
                  <Link
                    href={`/customers/${c.id}`}
                    style={{ width: isMobile ? "100%" : "auto" }}
                  >
                    <button
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
                      {t.viewDetail}
                    </button>
                  </Link>

                  <button
                    onClick={() => deleteCustomer(c.id)}
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
                </div>
              </div>
            ))}
          </div>
        </div>

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
      </div>
    </main>
  );
}