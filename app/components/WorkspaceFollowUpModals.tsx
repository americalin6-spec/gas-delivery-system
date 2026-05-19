"use client";

import { useState, type CSSProperties } from "react";
import { followUpWorkspaceCopy } from "../lib/followUpWorkspaceI18n";
import {
  buildNextFollowUpPatch,
  getEffectiveNextFollowUpAt,
  postponePresetDate,
  type WorkspaceCustomerRow,
} from "../lib/followUpWorkspace";
import type { AppLang } from "../lib/appLang";
import { getClientCompanyId } from "../lib/clientCompany";
import { supabase } from "../supabase";

type ModalKind = "complete" | "postpone" | null;

function toDatetimeLocalValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function useWorkspaceFollowUpActions(lang: AppLang, onRefresh: () => void) {
  const labels = followUpWorkspaceCopy(lang);
  const [modal, setModal] = useState<ModalKind>(null);
  const [active, setActive] = useState<WorkspaceCustomerRow | null>(null);
  const [note, setNote] = useState("");
  const [nextLocal, setNextLocal] = useState("");
  const [busy, setBusy] = useState(false);

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
      .eq("company_id", getClientCompanyId())
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
      .eq("company_id", getClientCompanyId())
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

  const modals =
    modal && active ? (
      <div style={overlay} role="presentation" onClick={() => !busy && setModal(null)}>
        <div style={panel} role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
          <h3 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 800 }}>
            {modal === "complete" ? labels.completeTitle : labels.postponeTitle}
          </h3>
          <p style={{ margin: "0 0 12px", opacity: 0.85 }}>{active.customer_name?.trim() || labels.unnamed}</p>

          {modal === "complete" ? (
            <>
              <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                {labels.followUpNote}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
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
                  boxSizing: "border-box",
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
    ) : null;

  return { openComplete, openPostpone, modals };
}
