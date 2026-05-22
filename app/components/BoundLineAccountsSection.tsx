"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import { customerDetailCopy } from "../lib/customersI18n";
import { formatCustomerCreatedAtDisplay } from "../lib/customerSoftDelete";
import { companyIdHeader, logActiveCompany } from "../lib/clientCompany";
import type { LineUserBindingRow } from "../lib/lineUsersServer";
import { useActiveCompany } from "./ActiveCompanyProvider";

export type BoundLineAccount = {
  line_user_id: string;
  display_name: string | null;
  created_at: string | null;
  isPrimary: boolean;
};

const ui = {
  surface: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.12)",
  text: "#f8fafc",
  muted: "#94a3b8",
  faint: "#64748b",
  accent: "#6366f1",
  line: "rgba(6,199,85,0.45)",
  lineBg: "rgba(6,199,85,0.1)",
  primaryBorder: "rgba(6,199,85,0.65)",
  primaryBg: "rgba(6,199,85,0.16)",
  shadow: "0 1px 0 rgba(255,255,255,0.06) inset, 0 18px 48px rgba(0,0,0,0.35)",
  radiusLg: 16,
  radiusMd: 12,
};

function toBoundAccounts(
  rows: LineUserBindingRow[],
  primaryLineUserId: string | null | undefined,
): BoundLineAccount[] {
  const primary = primaryLineUserId?.trim() || null;
  return rows
    .map((row) => {
      const line_user_id = row.line_user_id?.trim() ?? "";
      if (!line_user_id) return null;
      return {
        line_user_id,
        display_name: row.display_name?.trim() || null,
        created_at: row.created_at ?? null,
        isPrimary: primary === line_user_id,
      };
    })
    .filter((row): row is BoundLineAccount => row != null)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
}

function formatBoundAt(value: string | null, lang: AppLang): string {
  if (!value) return "—";
  return formatCustomerCreatedAtDisplay(value, lang) ?? value;
}

export function BoundLineAccountsSection({
  customerId,
  primaryLineUserId,
  isMobile,
  lang,
  selectedLineUserId,
  onSelectLineUser,
  onOpenConversation,
}: {
  customerId: string;
  primaryLineUserId?: string | null;
  isMobile: boolean;
  lang: AppLang;
  selectedLineUserId: string | null;
  onSelectLineUser: (lineUserId: string) => void;
  onOpenConversation: (lineUserId: string, displayLabel: string) => void;
}) {
  const t = customerDetailCopy(lang);
  const { companyId, ready: companyReady } = useActiveCompany();
  const [accounts, setAccounts] = useState<BoundLineAccount[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const id = customerId?.trim();
    if (!id || !companyReady || companyId <= 0) return;

    setLoading(true);
    setError(null);
    logActiveCompany("boundLineAccounts.load", { customerId: id, companyId });

    try {
      const query = new URLSearchParams({ customer_id: id });
      const primary = primaryLineUserId?.trim();
      if (primary) query.set("primary_line_user_id", primary);

      const url = `/api/line-users?${query.toString()}`;
      const res = await fetch(url, { cache: "no-store", headers: companyIdHeader() });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: LineUserBindingRow[];
        count?: number;
        error?: string;
      };

      console.log("[boundLineAccounts] API response:", {
        customerId: id,
        companyId,
        httpOk: res.ok,
        apiOk: body.ok,
        count: body.count ?? body.rows?.length ?? 0,
        error: body.error ?? null,
      });

      if (!res.ok || !body.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        setAccounts([]);
        setRowCount(0);
        return;
      }

      const rows = Array.isArray(body.rows) ? body.rows : [];
      const count = typeof body.count === "number" ? body.count : rows.length;
      setRowCount(count);
      setAccounts(toBoundAccounts(rows, primaryLineUserId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAccounts([]);
      setRowCount(0);
    } finally {
      setLoading(false);
    }
  }, [customerId, companyId, companyReady, primaryLineUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cardStyle: CSSProperties = {
    borderRadius: ui.radiusLg,
    padding: isMobile ? 20 : 24,
    border: `1px solid ${ui.line}`,
    background:
      "linear-gradient(155deg, rgba(6,199,85,0.1) 0%, rgba(15,23,42,0.78) 48%, rgba(15,23,42,0.94) 100%)",
    boxShadow: ui.shadow,
    marginBottom: isMobile ? 22 : 28,
  };

  const sectionHeading: CSSProperties = {
    margin: "0 0 6px",
    fontSize: isMobile ? 20 : 22,
    fontWeight: 800,
    color: ui.text,
    letterSpacing: "-0.02em",
  };

  function handleOpen(lineUserId: string, displayLabel: string) {
    onSelectLineUser(lineUserId);
    onOpenConversation(lineUserId, displayLabel);
  }

  return (
    <section style={cardStyle} aria-labelledby="bound-line-accounts-heading">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div>
          <h2 id="bound-line-accounts-heading" style={sectionHeading}>
            {t.boundLineAccountsTitle}
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: ui.muted, lineHeight: 1.5 }}>
            {loading ? t.conversationsLoading : t.boundLineCount(rowCount)}
          </p>
        </div>
      </div>

      {error ? (
        <p style={{ margin: 0, color: "#fca5a5", fontSize: 14 }}>{error}</p>
      ) : null}

      {!loading && !error && rowCount === 0 ? (
        <p style={{ margin: 0, fontSize: 15, color: ui.muted, lineHeight: 1.55 }}>{t.noBoundLineAccounts}</p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {accounts.map((account) => {
          const selected = selectedLineUserId === account.line_user_id;
          const label = account.display_name || account.line_user_id;
          return (
            <div
              key={account.line_user_id}
              role="button"
              tabIndex={0}
              onClick={() => handleOpen(account.line_user_id, label)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpen(account.line_user_id, label);
                }
              }}
              style={{
                padding: isMobile ? 14 : 16,
                borderRadius: ui.radiusMd,
                border: selected
                  ? `2px solid ${ui.primaryBorder}`
                  : account.isPrimary
                    ? `1px solid ${ui.primaryBorder}`
                    : `1px solid ${ui.border}`,
                background: selected
                  ? ui.primaryBg
                  : account.isPrimary
                    ? "rgba(6,199,85,0.08)"
                    : ui.surface,
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 16, color: ui.text }}>{label}</span>
                {account.isPrimary ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(6,199,85,0.35)",
                      color: "#bbf7d0",
                    }}
                  >
                    {t.primaryLineAccount}
                  </span>
                ) : null}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                  gap: isMobile ? 10 : 14,
                  fontSize: 14,
                  color: ui.muted,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ui.faint, marginBottom: 4 }}>
                    {t.lineDisplayNameLabel}
                  </div>
                  <div style={{ color: ui.text, wordBreak: "break-word" }}>
                    {account.display_name || "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ui.faint, marginBottom: 4 }}>
                    {t.lineUserIdLabel}
                  </div>
                  <div
                    style={{
                      color: "#86efac",
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 13,
                      wordBreak: "break-all",
                    }}
                  >
                    {account.line_user_id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ui.faint, marginBottom: 4 }}>
                    {t.lineBoundAtLabel}
                  </div>
                  <div style={{ color: ui.text }}>{formatBoundAt(account.created_at, lang)}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpen(account.line_user_id, label);
                }}
                style={{
                  marginTop: 14,
                  width: isMobile ? "100%" : "auto",
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: `1px solid ${ui.line}`,
                  background: "rgba(6,199,85,0.22)",
                  color: "#ecfdf5",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {t.openConversation}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
