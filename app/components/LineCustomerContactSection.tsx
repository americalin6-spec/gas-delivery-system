"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { openLineChat } from "../lib/openLineApp";
import { supabase } from "../../supabase";
import type { CopyWithFallbackOptions } from "../hooks/useCopyWithFallback";
import { BoundLineAccountsSection } from "./BoundLineAccountsSection";

const LINE_BRAND = "#06C755";

function formatLastContact(iso?: string | null): string {
  if (!iso?.trim()) return "尚無資料";
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso ?? "尚無資料";
  }
}

export function LineCustomerContactSection({
  customerId,
  companyId,
  lineId,
  lastContactedAt,
  primaryLineUserId,
  selectedLineUserId,
  isMobile,
  showToast,
  copyWithFallback,
  onLineIdSaved,
  onSelectLineUser,
  cardStyle,
}: {
  customerId: string;
  companyId: number;
  lineId: string | null | undefined;
  lastContactedAt?: string | null;
  primaryLineUserId?: string | null;
  selectedLineUserId: string | null;
  isMobile: boolean;
  showToast: (message: string) => void;
  copyWithFallback: (text: string, options?: CopyWithFallbackOptions) => Promise<boolean>;
  onLineIdSaved: () => void | Promise<void>;
  onSelectLineUser: (lineUserId: string, displayLabel: string) => void;
  cardStyle: CSSProperties;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const lid = lineId?.trim() ?? "";

  useEffect(() => {
    setDraft(lid);
  }, [lid]);

  async function saveLineId() {
    if (!customerId || companyId <= 0 || saving) return;
    const value = draft.trim();
    setSaving(true);
    const { error } = await supabase
      .from("customers")
      .update({ line_id: value === "" ? null : value })
      .eq("company_id", companyId)
      .eq("id", customerId);
    setSaving(false);
    if (error) {
      showToast(error.message);
      return;
    }
    await onLineIdSaved();
    showToast("已儲存 LINE ID");
  }

  async function copyLineId() {
    if (!lid) {
      showToast("尚未填寫 LINE ID");
      return;
    }
    await copyWithFallback(lid, {
      title: "複製 LINE 帳號",
      description: "若無法自動複製，請點下方按鈕",
      tapLabel: "點此複製",
      closeLabel: "關閉",
      copiedLabel: "已複製！",
      onSuccess: () => showToast("已複製 LINE 帳號"),
    });
  }

  const btn: CSSProperties = {
    padding: "8px 14px",
    borderRadius: 10,
    border: `1px solid rgba(255,255,255,0.14)`,
    background: "rgba(0,0,0,0.22)",
    color: "#f8fafc",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    flex: isMobile ? "1 1 100%" : "1 1 auto",
  };

  return (
    <section style={cardStyle} aria-label="LINE 客戶聯絡">
      <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800, color: "#86efac" }}>
        LINE 客戶聯絡
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <label
            htmlFor="customer-line-id-input"
            style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}
          >
            客戶 LINE ID
          </label>
          <input
            id="customer-line-id-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="例如 lin19790724"
            autoComplete="off"
            spellCheck={false}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.28)",
              color: "#f8fafc",
              fontSize: 14,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>最後聯絡時間</div>
          <div style={{ fontSize: 14, color: "#f8fafc", padding: "8px 0" }}>
            {formatLastContact(lastContactedAt)}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveLineId()}
          style={{
            ...btn,
            border: `1px solid rgba(6,199,85,0.55)`,
            background: `linear-gradient(135deg, ${LINE_BRAND}, #05a849)`,
            color: "#fff",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "儲存中…" : "儲存 LINE ID"}
        </button>
        <button
          type="button"
          style={{ ...btn, opacity: lid ? 1 : 0.5, cursor: lid ? "pointer" : "not-allowed" }}
          disabled={!lid}
          onClick={() => void copyLineId()}
        >
          複製 LINE 帳號
        </button>
        <button
          type="button"
          style={{ ...btn, opacity: lid ? 1 : 0.5, cursor: lid ? "pointer" : "not-allowed" }}
          disabled={!lid}
          onClick={() => openLineChat(lid)}
        >
          開啟 LINE 加好友
        </button>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
        桌機瀏覽器會顯示 QR Code，請用手機 LINE 掃描加入好友。
      </p>

      <BoundLineAccountsSection
        customerId={customerId}
        primaryLineUserId={primaryLineUserId}
        customerLineId={lineId}
        isMobile={isMobile}
        lang="zh"
        selectedLineUserId={selectedLineUserId}
        onSelectLineUser={onSelectLineUser}
        embedded
      />
    </section>
  );
}
