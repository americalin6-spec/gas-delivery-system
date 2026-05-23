"use client";

import { type CSSProperties, type ReactNode, type RefObject } from "react";
import type { AppLang } from "../lib/appLang";
import { customersListCopy } from "../lib/customersI18n";
import {
  PIPELINE_STATUSES,
  pipelineStatusLabel,
  type PipelineStatus,
} from "../lib/pipelineStatus";

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

function FilterColumn({ label, children }: { label: string; children: ReactNode }) {
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

/** Customer-facing search + filters — never hidden by internal nav settings. */
export function CrmCustomerSearchToolbar({
  lang,
  isMobile,
  trashView,
  search,
  onSearchChange,
  searchInputRef,
  statusFilter,
  onStatusFilterChange,
  followFilter,
  onFollowFilterChange,
  urgencyFilter,
  onUrgencyFilterChange,
}: {
  lang: AppLang;
  isMobile: boolean;
  trashView: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  followFilter: FollowFilter;
  onFollowFilterChange: (value: FollowFilter) => void;
  urgencyFilter: UrgencyFilter;
  onUrgencyFilterChange: (value: UrgencyFilter) => void;
}) {
  const t = customersListCopy(lang);

  return (
    <section
      aria-label={t.searchTitle}
      style={{
        marginBottom: 28,
        padding: isMobile ? 16 : 18,
        borderRadius: 14,
        background: "#081b33",
        border: "1px solid rgba(129,140,248,0.28)",
        boxSizing: "border-box",
      }}
    >
      <h2
        style={{
          margin: "0 0 12px",
          fontSize: isMobile ? 18 : 20,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        {t.searchTitle}
      </h2>

      <input
        ref={searchInputRef}
        type="search"
        name="customer-search"
        autoComplete="off"
        aria-label={t.searchPlaceholder}
        placeholder={t.searchPlaceholder}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          width: "100%",
          padding: "18px 20px",
          borderRadius: 14,
          border: "1px solid rgba(148,163,184,0.4)",
          marginBottom: trashView ? 0 : 16,
          background: "#102742",
          color: "white",
          fontSize: 17,
          boxSizing: "border-box",
        }}
      />

      {!trashView ? (
        <>
          <h3
            style={{
              margin: "0 0 12px",
              fontSize: isMobile ? 16 : 17,
              fontWeight: 700,
              color: "rgba(226,232,240,0.9)",
            }}
          >
            {t.filtersTitle}
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <FilterColumn label={t.filterStatus}>
              <select
                value={statusFilter}
                onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
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
                onChange={(e) => onFollowFilterChange(e.target.value as FollowFilter)}
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
                onChange={(e) => onUrgencyFilterChange(e.target.value as UrgencyFilter)}
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
        </>
      ) : null}
    </section>
  );
}
