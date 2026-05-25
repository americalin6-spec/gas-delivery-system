"use client";

import { useMemo, type CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import {
  filterDueToday,
  filterHighDeal,
  filterOverdue,
  filterRecent,
  filterTrackingEligible,
  type WorkspaceCustomerRow,
} from "../lib/followUpWorkspace";
import { followUpWorkspaceCopy } from "../lib/followUpWorkspaceI18n";
import { workspaceCategoryPath } from "../lib/workspaceCategories";
import { WorkspaceSummaryCard } from "./WorkspaceSummaryCard";

export function TodayFollowUpWorkspace({
  rows,
  lang,
  isMobile,
  loading,
  loadError,
  enabled = true,
}: {
  rows: WorkspaceCustomerRow[];
  lang: AppLang;
  isMobile: boolean;
  loading: boolean;
  loadError: string | null;
  /** When false, do not render workspace UI (public / pre-auth). */
  enabled?: boolean;
}) {
  if (!enabled) {
    return null;
  }

  const labels = followUpWorkspaceCopy(lang);

  const activeRows = useMemo(() => filterTrackingEligible(rows), [rows]);

  const dueToday = useMemo(() => filterDueToday(activeRows), [activeRows]);
  const overdue = useMemo(() => filterOverdue(activeRows), [activeRows]);
  const highDeal = useMemo(() => filterHighDeal(activeRows), [activeRows]);
  const recent = useMemo(() => filterRecent(activeRows), [activeRows]);

  const grid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
    gap: isMobile ? 12 : 16,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  };

  const summaries = [
    { title: labels.dueToday, href: workspaceCategoryPath("today"), rows: dueToday },
    { title: labels.overdue, href: workspaceCategoryPath("overdue"), rows: overdue },
    { title: labels.highDeal, href: workspaceCategoryPath("high-probability"), rows: highDeal },
    { title: labels.recent, href: workspaceCategoryPath("recent"), rows: recent },
  ] as const;

  return (
    <section
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        marginBottom: isMobile ? 24 : 28,
        overflow: "hidden",
      }}
    >
      <h2 style={{ margin: "0 0 14px", fontSize: isMobile ? 24 : 28, fontWeight: 800 }}>
        {labels.title}
      </h2>

      {loadError ? (
        <p style={{ color: "#fecaca", marginBottom: 12, lineHeight: 1.5, fontSize: 14 }}>
          {labels.loadError}: {loadError}
          <br />
          <span style={{ fontSize: 14, opacity: 0.9 }}>{labels.sqlHint}</span>
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: "#94a3b8", margin: 0, fontSize: 14 }}>{labels.loading}</p>
      ) : (
        <div style={grid}>
          {summaries.map((item) => (
            <WorkspaceSummaryCard
              key={item.href}
              title={item.title}
              href={item.href}
              rows={item.rows}
              lang={lang}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}
    </section>
  );
}
