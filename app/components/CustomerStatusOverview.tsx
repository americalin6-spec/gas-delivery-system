"use client";

import { useMemo, type CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import {
  computeCustomerStatusStats,
  CUSTOMER_STATUSES,
  customerStatusLabel,
  customerStatusVisual,
  TRACKING_EXCLUDED_STATUSES,
} from "../lib/customerStatus";
import type { WorkspaceCustomerRow } from "../lib/followUpWorkspace";
import { followUpWorkspaceCopy } from "../lib/followUpWorkspaceI18n";

export function CustomerStatusOverview({
  rows,
  lang,
  isMobile,
}: {
  rows: WorkspaceCustomerRow[];
  lang: AppLang;
  isMobile: boolean;
}) {
  const labels = followUpWorkspaceCopy(lang);
  const stats = useMemo(() => computeCustomerStatusStats(rows), [rows]);

  const activeStatuses = CUSTOMER_STATUSES.filter(
    (s) => !TRACKING_EXCLUDED_STATUSES.includes(s),
  );

  const grid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: isMobile
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(5, minmax(0, 1fr))",
    gap: isMobile ? 8 : 10,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  };

  return (
    <section
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        marginBottom: isMobile ? 16 : 20,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "6px 12px",
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: isMobile ? 16 : 18, fontWeight: 800 }}>{labels.statusOverview}</h3>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>
          {labels.activeCustomers}: {stats.active} / {stats.total}
        </span>
      </div>
      <div style={grid}>
        {activeStatuses.map((status) => {
          const count = stats.byStatus[status];
          const v = customerStatusVisual(status);
          return (
            <div
              key={status}
              style={{
                padding: isMobile ? "10px 12px" : "12px 14px",
                borderRadius: 12,
                border: `1px solid ${v.border}`,
                background: v.bg,
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: v.color, lineHeight: 1.35 }}>
                {customerStatusLabel(status, lang)}
              </div>
              <div style={{ marginTop: 6, fontSize: isMobile ? 22 : 24, fontWeight: 800, color: "#f8fafc" }}>
                {count}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
