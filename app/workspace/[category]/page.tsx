"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { WorkspaceCategoryList } from "../../components/WorkspaceCategoryList";
import { useCopyWithFallback } from "../../hooks/useCopyWithFallback";
import { useAppLang } from "../../hooks/useAppLang";
import { useWorkspaceCustomers } from "../../hooks/useWorkspaceCustomers";
import { useIsViewportBelow } from "../../hooks/useViewportWidth";
import { followUpWorkspaceCopy } from "../../lib/followUpWorkspaceI18n";
import {
  getWorkspaceCategoryRows,
  isWorkspaceCategorySlug,
  type WorkspaceCategorySlug,
} from "../../lib/workspaceCategories";
import { workspaceCategoryTitle } from "../../lib/workspaceCategoryMeta";

const MOBILE_MAX = 1024;

export default function WorkspaceCategoryPage() {
  const params = useParams();
  const raw = typeof params.category === "string" ? params.category : "";
  const category: WorkspaceCategorySlug | null = isWorkspaceCategorySlug(raw) ? raw : null;

  const { lang } = useAppLang();
  const labels = followUpWorkspaceCopy(lang);
  const isMobile = useIsViewportBelow(MOBILE_MAX);
  const { copyWithFallback, fallbackModal } = useCopyWithFallback(isMobile, lang);
  const { rows, loading, loadError, refresh } = useWorkspaceCustomers();

  const [search, setSearch] = useState("");

  const categoryRows = useMemo(
    () => (category ? getWorkspaceCategoryRows(category, rows) : []),
    [category, rows],
  );

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return categoryRows;
    return categoryRows.filter((row) => {
      const haystack = [
        row.customer_name,
        row.phone,
        row.line_id,
        row.customer_need,
        row.note,
        row.next_step,
        row.follow_up,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [categoryRows, search]);

  const title = category ? workspaceCategoryTitle(category, lang) : labels.title;

  if (!category) {
    notFound();
  }

  const page: CSSProperties = {
    minHeight: "100vh",
    background: "#0b1a2d",
    color: "#fff",
    padding: isMobile ? "20px 16px 40px" : "32px 28px 48px",
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "100%",
    overflowX: "hidden",
  };

  const inner: CSSProperties = {
    width: "100%",
    maxWidth: 960,
    margin: "0 auto",
    minWidth: 0,
  };

  const backBtn: CSSProperties = {
    display: "inline-block",
    marginBottom: 20,
    padding: isMobile ? "12px 18px" : "12px 22px",
    borderRadius: 12,
    border: "none",
    background: "#102742",
    color: "#fff",
    fontWeight: 700,
    fontSize: 16,
    textDecoration: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  };

  return (
    <main style={page}>
      <div style={inner}>
        <Link href="/" style={backBtn}>
          {labels.backHome}
        </Link>

        <h1 style={{ margin: "0 0 8px", fontSize: isMobile ? 26 : 32, fontWeight: 800, lineHeight: 1.25 }}>
          {title}
        </h1>
        <p style={{ margin: "0 0 16px", color: "#94a3b8", fontSize: 15 }}>
          {filteredRows.length} {lang === "zh" ? "位客戶" : "customers"}
          {search.trim() && filteredRows.length !== categoryRows.length
            ? lang === "zh"
              ? `（共 ${categoryRows.length} 位）`
              : ` (${categoryRows.length} total)`
            : null}
        </p>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          style={{
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
            padding: "16px 18px",
            marginBottom: 20,
            borderRadius: 12,
            border: "1px solid rgba(148,163,184,0.4)",
            background: "#102742",
            color: "#fff",
            fontSize: 16,
          }}
        />

        {loadError ? (
          <p style={{ color: "#fecaca", marginBottom: 16, lineHeight: 1.5 }}>
            {labels.loadError}: {loadError}
            <br />
            <span style={{ fontSize: 14, opacity: 0.9 }}>{labels.sqlHint}</span>
          </p>
        ) : null}

        {loading ? (
          <p style={{ color: "#94a3b8" }}>{labels.loading}</p>
        ) : (
          <WorkspaceCategoryList
            rows={filteredRows}
            lang={lang}
            isMobile={isMobile}
            onRefresh={() => void refresh()}
            copyWithFallback={copyWithFallback}
          />
        )}
      </div>
      {fallbackModal}
    </main>
  );
}
