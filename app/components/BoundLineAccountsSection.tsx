"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import { customerDetailCopy } from "../lib/customersI18n";
import { formatCustomerCreatedAtDisplay } from "../lib/customerSoftDelete";
import { logActiveCompany } from "../lib/clientCompany";
import { buildLineChatUrl, openLineChat } from "../lib/openLineApp";
import type { LineUserBindingRow } from "../lib/lineUsersServer";
import { useActiveCompany } from "./ActiveCompanyProvider";
import { dt } from "../lib/customerDetailTypography";

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
  line: "rgba(6,199,85,0.45)",
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

function EmbeddedAccountCard({
  account,
  selected,
  label,
  onSelect,
}: {
  account: BoundLineAccount;
  selected: boolean;
  label: string;
  onSelect: (lineUserId: string, displayLabel: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(account.line_user_id, label)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(account.line_user_id, label);
        }
      }}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: selected ? `2px solid ${ui.primaryBorder}` : `1px solid ${ui.border}`,
        background: selected ? ui.primaryBg : ui.surface,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: dt.paragraph, color: ui.text }}>{label}</span>
        {account.isPrimary ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(6,199,85,0.35)",
              color: "#bbf7d0",
            }}
          >
            主要 LINE
          </span>
        ) : null}
        <span style={{ fontSize: dt.small, color: ui.faint }}>點選以篩選對話</span>
      </div>
      <div
        style={{
          fontSize: dt.meta,
          fontFamily: "ui-monospace, monospace",
          color: "#86efac",
          wordBreak: "break-all",
        }}
      >
        {account.line_user_id}
      </div>
    </div>
  );
}

function FullAccountCard({
  account,
  selected,
  label,
  isMobile,
  lang,
  canOpenLine,
  onSelect,
  onOpenLine,
}: {
  account: BoundLineAccount;
  selected: boolean;
  label: string;
  isMobile: boolean;
  lang: AppLang;
  canOpenLine: boolean;
  onSelect: (lineUserId: string, displayLabel: string) => void;
  onOpenLine: () => void;
}) {
  const t = customerDetailCopy(lang);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(account.line_user_id, label)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(account.line_user_id, label);
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
        transition: "border-color 0.15s, background 0.15s",
        cursor: "pointer",
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
        <span style={{ fontWeight: 800, fontSize: dt.paragraph, color: ui.text }}>{label}</span>
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
          fontSize: dt.paragraph,
          color: ui.muted,
          lineHeight: dt.lineHeight,
        }}
      >
        <div>
          <div style={{ fontSize: dt.labelUpper, fontWeight: 700, color: ui.faint, marginBottom: 4 }}>
            {t.lineDisplayNameLabel}
          </div>
          <div style={{ color: ui.text, wordBreak: "break-word" }}>{account.display_name || "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: dt.labelUpper, fontWeight: 700, color: ui.faint, marginBottom: 4 }}>
            {t.lineUserIdLabel}
          </div>
          <div
            style={{
              color: "#86efac",
              fontFamily: "ui-monospace, monospace",
              fontSize: dt.meta,
              wordBreak: "break-all",
            }}
          >
            {account.line_user_id}
          </div>
        </div>
        <div>
          <div style={{ fontSize: dt.labelUpper, fontWeight: 700, color: ui.faint, marginBottom: 4 }}>
            {t.lineBoundAtLabel}
          </div>
          <div style={{ color: ui.text }}>{formatBoundAt(account.created_at, lang)}</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          disabled={!canOpenLine}
          onClick={(e) => {
            e.stopPropagation();
            onOpenLine();
          }}
          style={{
            width: isMobile ? "100%" : "auto",
            padding: "10px 18px",
            borderRadius: 10,
            border: `1px solid ${canOpenLine ? ui.line : ui.border}`,
            background: canOpenLine ? "rgba(6,199,85,0.22)" : "rgba(15,23,42,0.5)",
            color: canOpenLine ? "#ecfdf5" : ui.muted,
            fontWeight: 700,
            fontSize: 14,
            cursor: canOpenLine ? "pointer" : "not-allowed",
            opacity: canOpenLine ? 1 : 0.65,
          }}
        >
          {canOpenLine ? t.openLineAddFriend : t.lineIdRequiredForChat}
        </button>
        {canOpenLine ? (
          <p style={{ margin: "8px 0 0", fontSize: dt.meta, color: ui.faint, lineHeight: dt.lineHeight }}>
            {t.openLineAddFriendQrHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function BoundLineAccountsSection({
  customerId,
  primaryLineUserId,
  customerLineId,
  isMobile,
  lang,
  selectedLineUserId,
  onSelectLineUser,
  embedded = false,
}: {
  customerId: string;
  primaryLineUserId?: string | null;
  customerLineId?: string | null;
  isMobile: boolean;
  lang: AppLang;
  selectedLineUserId: string | null;
  onSelectLineUser: (lineUserId: string, displayLabel: string) => void;
  embedded?: boolean;
}) {
  const t = customerDetailCopy(lang);
  const { companyId, ready: companyReady } = useActiveCompany();
  const [accounts, setAccounts] = useState<BoundLineAccount[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const primaryLineRef = useRef(primaryLineUserId);
  primaryLineRef.current = primaryLineUserId;
  const loadInFlightRef = useRef(false);

  const load = useCallback(async () => {
    const id = customerId?.trim();
    if (!id || !companyReady || companyId <= 0 || loadInFlightRef.current) return;

    loadInFlightRef.current = true;
    setLoading(true);
    setError(null);
    logActiveCompany("boundLineAccounts.load", { customerId: id, companyId });

    try {
      const query = new URLSearchParams({ customer_id: id });
      const primary = primaryLineRef.current?.trim();
      if (primary) query.set("primary_line_user_id", primary);

      const res = await fetch(`/api/line-users?${query.toString()}`, {
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: LineUserBindingRow[];
        count?: number;
        error?: string;
      };

      if (!res.ok || !body.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        setAccounts([]);
        setRowCount(0);
        return;
      }

      const rows = Array.isArray(body.rows) ? body.rows : [];
      setRowCount(typeof body.count === "number" ? body.count : rows.length);
      setAccounts(toBoundAccounts(rows, primaryLineRef.current));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAccounts([]);
      setRowCount(0);
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, [customerId, companyId, companyReady]);

  useEffect(() => {
    void load();
  }, [customerId, companyId, companyReady]);

  const canOpenLine = Boolean(buildLineChatUrl(customerLineId));

  function handleOpenLineChat() {
    openLineChat(customerLineId);
  }

  const shellStyle: CSSProperties = embedded
    ? { margin: 0, padding: 0, border: "none", background: "transparent", boxShadow: "none" }
    : {
        borderRadius: ui.radiusLg,
        padding: isMobile ? 20 : 24,
        border: `1px solid ${ui.line}`,
        background:
          "linear-gradient(155deg, rgba(6,199,85,0.1) 0%, rgba(15,23,42,0.78) 48%, rgba(15,23,42,0.94) 100%)",
        boxShadow: ui.shadow,
        marginBottom: isMobile ? 22 : 28,
      };

  const headingStyle: CSSProperties = {
    margin: "0 0 6px",
    fontSize: embedded ? dt.compactSection : isMobile ? 20 : 22,
    fontWeight: 800,
    color: ui.text,
    letterSpacing: "-0.02em",
  };

  const accountCards = accounts.map((account) => {
    const selected = selectedLineUserId === account.line_user_id;
    const label = account.display_name || account.line_user_id;

    if (embedded) {
      return (
        <EmbeddedAccountCard
          key={account.line_user_id}
          account={account}
          selected={selected}
          label={label}
          onSelect={onSelectLineUser}
        />
      );
    }

    return (
      <FullAccountCard
        key={account.line_user_id}
        account={account}
        selected={selected}
        label={label}
        isMobile={isMobile}
        lang={lang}
        canOpenLine={canOpenLine}
        onSelect={onSelectLineUser}
        onOpenLine={handleOpenLineChat}
      />
    );
  });

  const inner = (
    <div>
      <div style={{ marginBottom: embedded ? 12 : 18 }}>
        <h3 id="bound-line-accounts-heading" style={headingStyle}>
          {embedded ? "已綁定 LINE 帳號" : t.boundLineAccountsTitle}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: embedded ? dt.meta : 14,
            color: ui.muted,
            lineHeight: embedded ? dt.lineHeight : 1.5,
          }}
        >
          {loading ? "載入中…" : embedded ? `已綁定 ${rowCount} 個帳號` : t.boundLineCount(rowCount)}
        </p>
      </div>

      {error ? (
        <p style={{ margin: "0 0 10px", color: "#fca5a5", fontSize: dt.paragraph, lineHeight: dt.lineHeight }}>
          {error}
        </p>
      ) : null}

      {!loading && !error && rowCount === 0 ? (
        <p
          style={{
            margin: "0 0 10px",
            fontSize: embedded ? dt.meta : 15,
            color: ui.muted,
            lineHeight: embedded ? dt.lineHeightBody : 1.55,
          }}
        >
          {t.noBoundLineAccounts}
        </p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: embedded ? 8 : 12 }}>{accountCards}</div>
    </div>
  );

  if (embedded) {
    return <div style={shellStyle}>{inner}</div>;
  }

  return <section style={shellStyle}>{inner}</section>;
}
