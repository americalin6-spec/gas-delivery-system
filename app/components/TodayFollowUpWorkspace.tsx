"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import {
  buildNextFollowUpPatch,
  filterDueToday,
  filterHighDeal,
  filterOverdue,
  filterRecent,
  followUpStatusLabel,
  formatWorkspaceDateTime,
  getEffectiveNextFollowUpAt,
  getLastContactAt,
  postponePresetDate,
  type WorkspaceCustomerRow,
} from "../lib/followUpWorkspace";
import { followUpWorkspaceCopy } from "../lib/followUpWorkspaceI18n";
import { translateDisplayValue } from "../lib/uiI18n";
import { supabase } from "../supabase";
import { TextInputWithVoice } from "./VoiceInputButton";
import type { CopyWithFallbackOptions } from "../hooks/useCopyWithFallback";

type ModalKind = "complete" | "postpone" | null;

function toDatetimeLocalValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function WorkspaceCustomerCard({
  row,
  lang,
  isMobile,
  labels,
  onComplete,
  onPostpone,
  copyWithFallback,
}: {
  row: WorkspaceCustomerRow;
  lang: AppLang;
  isMobile: boolean;
  labels: ReturnType<typeof followUpWorkspaceCopy>;
  onComplete: (row: WorkspaceCustomerRow) => void;
  onPostpone: (row: WorkspaceCustomerRow) => void;
  copyWithFallback: (text: string, options?: CopyWithFallbackOptions) => Promise<boolean>;
}) {
  const name = row.customer_name?.trim() || labels.unnamed;
  const deal = row.success_rate ?? row.deal_probability;
  const status = followUpStatusLabel(row, lang);
  const lastAt = getLastContactAt(row);
  const nextAt = getEffectiveNextFollowUpAt(row);

  const fields: { label: string; value: string }[] = [
    { label: labels.customerName, value: name },
    { label: labels.phone, value: row.phone?.trim() || "—" },
    { label: labels.lineId, value: row.line_id?.trim() || "—" },
    { label: labels.customerNeed, value: row.customer_need?.trim() || "—" },
    {
      label: labels.dealProbability,
      value: deal?.trim() ? translateDisplayValue(deal, lang) : "—",
    },
    { label: labels.followStatus, value: status },
    { label: labels.lastContact, value: lastAt ? formatWorkspaceDateTime(lastAt, lang) : "—" },
    { label: labels.nextFollowUp, value: nextAt ? formatWorkspaceDateTime(nextAt, lang) : "—" },
    { label: labels.remark, value: row.follow_up_note?.trim() || row.note?.trim() || "—" },
  ];

  const btn: CSSProperties = {
    padding: isMobile ? "10px 12px" : "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.1)",
    color: "#f8fafc",
    fontSize: isMobile ? 14 : 13,
    fontWeight: 600,
    cursor: "pointer",
    flex: isMobile ? "1 1 calc(50% - 6px)" : "0 1 auto",
    minWidth: 0,
    textAlign: "center",
    textDecoration: "none",
    boxSizing: "border-box",
  };

  return (
    <article
      style={{
        borderRadius: 16,
        border: "1px solid #1e3a5f",
        background: "rgba(16,39,66,0.85)",
        padding: isMobile ? 16 : 18,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <h3 style={{ margin: "0 0 12px", fontSize: isMobile ? 18 : 17, fontWeight: 800, wordBreak: "break-word" }}>
        {name}
      </h3>
      <dl style={{ margin: 0, display: "grid", gap: 8 }}>
        {fields.map((f) => (
          <div key={f.label} style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", fontSize: 14 }}>
            <dt style={{ margin: 0, opacity: 0.72, fontWeight: 600, flex: "0 0 auto" }}>{f.label}</dt>
            <dd style={{ margin: 0, flex: "1 1 120px", wordBreak: "break-word" }}>{f.value}</dd>
          </div>
        ))}
      </dl>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 14,
          maxWidth: "100%",
        }}
      >
        <Link href={`/customers/${row.id}`} style={btn}>
          {labels.view}
        </Link>
        <Link href={`/customers/${row.id}`} style={btn}>
          {labels.edit}
        </Link>
        <button type="button" style={btn} onClick={() => onComplete(row)}>
          {labels.complete}
        </button>
        <button type="button" style={btn} onClick={() => onPostpone(row)}>
          {labels.postpone}
        </button>
        <button
          type="button"
          style={btn}
          onClick={() => void copyWithFallback(row.line_id?.trim() || "", { title: labels.lineId })}
          disabled={!row.line_id?.trim()}
        >
          {labels.copyLine}
        </button>
        <button
          type="button"
          style={btn}
          onClick={() => void copyWithFallback(row.phone?.trim() || "", { title: labels.phone })}
          disabled={!row.phone?.trim()}
        >
          {labels.copyPhone}
        </button>
      </div>
    </article>
  );
}

function WorkspaceSection({
  title,
  rows,
  lang,
  isMobile,
  labels,
  onComplete,
  onPostpone,
  copyWithFallback,
}: {
  title: string;
  rows: WorkspaceCustomerRow[];
  lang: AppLang;
  isMobile: boolean;
  labels: ReturnType<typeof followUpWorkspaceCopy>;
  onComplete: (row: WorkspaceCustomerRow) => void;
  onPostpone: (row: WorkspaceCustomerRow) => void;
  copyWithFallback: (text: string, options?: CopyWithFallbackOptions) => Promise<boolean>;
}) {
  return (
    <section style={{ minWidth: 0, maxWidth: "100%" }}>
      <h2 style={{ margin: "0 0 12px", fontSize: isMobile ? 20 : 22, fontWeight: 800 }}>
        {title}
        <span style={{ marginLeft: 8, fontSize: 15, fontWeight: 600, color: "#94a3b8" }}>
          ({rows.length})
        </span>
      </h2>
      {rows.length === 0 ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 15 }}>{labels.empty}</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: "100%",
            maxWidth: "100%",
          }}
        >
          {rows.map((row) => (
            <WorkspaceCustomerCard
              key={String(row.id)}
              row={row}
              lang={lang}
              isMobile={isMobile}
              labels={labels}
              onComplete={onComplete}
              onPostpone={onPostpone}
              copyWithFallback={copyWithFallback}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function TodayFollowUpWorkspace({
  rows,
  lang,
  isMobile,
  loading,
  loadError,
  onRefresh,
  copyWithFallback,
}: {
  rows: WorkspaceCustomerRow[];
  lang: AppLang;
  isMobile: boolean;
  loading: boolean;
  loadError: string | null;
  onRefresh: () => void;
  copyWithFallback: (text: string, options?: CopyWithFallbackOptions) => Promise<boolean>;
}) {
  const labels = followUpWorkspaceCopy(lang);
  const [modal, setModal] = useState<ModalKind>(null);
  const [active, setActive] = useState<WorkspaceCustomerRow | null>(null);
  const [note, setNote] = useState("");
  const [nextLocal, setNextLocal] = useState("");
  const [busy, setBusy] = useState(false);

  const dueToday = useMemo(() => filterDueToday(rows), [rows]);
  const overdue = useMemo(() => filterOverdue(rows), [rows]);
  const highDeal = useMemo(() => filterHighDeal(rows), [rows]);
  const recent = useMemo(() => filterRecent(rows), [rows]);

  function openComplete(row: WorkspaceCustomerRow) {
    setActive(row);
    setNote(row.follow_up_note ?? "");
    const next = getEffectiveNextFollowUpAt(row) ?? new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    setNextLocal(toDatetimeLocalValue(next));
    setModal("complete");
  }

  function openPostpone(row: WorkspaceCustomerRow) {
    setActive(row);
    setModal("postpone");
  }

  async function saveComplete() {
    if (!active) return;
    setBusy(true);
    const next = new Date(nextLocal);
    if (Number.isNaN(next.getTime())) {
      setBusy(false);
      alert(labels.nextFollowUpPick);
      return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("customers")
      .update({
        last_contacted_at: now,
        last_contact_at: now,
        follow_up_note: note.trim() || null,
        ...buildNextFollowUpPatch(next),
      })
      .eq("id", active.id);

    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    setModal(null);
    setActive(null);
    onRefresh();
  }

  async function savePostpone(preset: "1h" | "tomorrow" | "3d" | "next_week") {
    if (!active) return;
    setBusy(true);
    const next = postponePresetDate(preset);
    const { error } = await supabase
      .from("customers")
      .update(buildNextFollowUpPatch(next))
      .eq("id", active.id);
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    setModal(null);
    setActive(null);
    onRefresh();
  }

  const overlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    boxSizing: "border-box",
  };

  const panel: CSSProperties = {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90vh",
    overflow: "auto",
    background: "#132846",
    borderRadius: 16,
    padding: 20,
    border: "1px solid #1e3a5f",
    color: "#fff",
    boxSizing: "border-box",
  };

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
      <h2 style={{ margin: "0 0 16px", fontSize: isMobile ? 24 : 28, fontWeight: 800 }}>{labels.title}</h2>

      {loadError ? (
        <p style={{ color: "#fecaca", marginBottom: 12, lineHeight: 1.5 }}>
          {labels.loadError}: {loadError}
          <br />
          <span style={{ fontSize: 14, opacity: 0.9 }}>{labels.sqlHint}</span>
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: "#94a3b8" }}>{labels.loading}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <WorkspaceSection
            title={labels.dueToday}
            rows={dueToday}
            lang={lang}
            isMobile={isMobile}
            labels={labels}
            onComplete={openComplete}
            onPostpone={openPostpone}
            copyWithFallback={copyWithFallback}
          />
          <WorkspaceSection
            title={labels.overdue}
            rows={overdue}
            lang={lang}
            isMobile={isMobile}
            labels={labels}
            onComplete={openComplete}
            onPostpone={openPostpone}
            copyWithFallback={copyWithFallback}
          />
          <WorkspaceSection
            title={labels.highDeal}
            rows={highDeal}
            lang={lang}
            isMobile={isMobile}
            labels={labels}
            onComplete={openComplete}
            onPostpone={openPostpone}
            copyWithFallback={copyWithFallback}
          />
          <WorkspaceSection
            title={labels.recent}
            rows={recent}
            lang={lang}
            isMobile={isMobile}
            labels={labels}
            onComplete={openComplete}
            onPostpone={openPostpone}
            copyWithFallback={copyWithFallback}
          />
        </div>
      )}

      {modal && active ? (
        <div style={overlay} role="presentation" onClick={() => !busy && setModal(null)}>
          <div
            style={panel}
            role="dialog"
            aria-modal
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 800 }}>
              {modal === "complete" ? labels.completeTitle : labels.postponeTitle}
            </h3>
            <p style={{ margin: "0 0 12px", opacity: 0.85 }}>{active.customer_name?.trim() || labels.unnamed}</p>

            {modal === "complete" ? (
              <>
                <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                  {labels.followUpNote}
                </label>
                <TextInputWithVoice
                  lang={lang}
                  multiline
                  value={note}
                  onChange={setNote}
                  rows={4}
                  style={{
                    width: "100%",
                    minHeight: 88,
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(0,0,0,0.2)",
                    color: "#fff",
                    resize: "vertical",
                    marginBottom: 14,
                  }}
                />
                <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                  {labels.nextFollowUpPick}
                </label>
                <input
                  type="datetime-local"
                  value={nextLocal}
                  onChange={(e) => setNextLocal(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(0,0,0,0.2)",
                    color: "#fff",
                    marginBottom: 16,
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveComplete()}
                    style={{
                      flex: "1 1 120px",
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: "none",
                      background: "#22c55e",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    {busy ? labels.saving : labels.save}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setModal(null)}
                    style={{
                      flex: "1 1 100px",
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: "1px solid #475569",
                      background: "transparent",
                      color: "#e2e8f0",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {labels.cancel}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(
                  [
                    ["1h", labels.postpone1h],
                    ["tomorrow", labels.postponeTomorrow],
                    ["3d", labels.postpone3d],
                    ["next_week", labels.postponeNextWeek],
                  ] as const
                ).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={busy}
                    onClick={() => void savePostpone(preset)}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 10,
                      border: "none",
                      background: "#1a3557",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 16,
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                  style={{
                    marginTop: 8,
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: "1px solid #475569",
                    background: "transparent",
                    color: "#e2e8f0",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {labels.cancel}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
