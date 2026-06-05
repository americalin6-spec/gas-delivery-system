"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { buildAiLineFollowUpReply } from "../lib/lineFollowUpReply";
import { dedupeGreetingPrefix } from "../lib/lineGreetingUtils";
import {
  buildLineReplyTemplateContent,
  LINE_REPLY_TEMPLATES,
  type LineReplyTemplateId,
} from "../lib/lineReplyTemplates";
import type { CopyWithFallbackOptions } from "../hooks/useCopyWithFallback";
import { dt } from "../lib/customerDetailTypography";

const LINE_BRAND = "#06C755";
const ui = {
  text: "#f8fafc",
  muted: "#94a3b8",
  faint: "#64748b",
  borderStrong: "rgba(255,255,255,0.12)",
  radiusMd: 12,
};

export type LineReplyCustomer = {
  id: string | number;
  customer_name?: string | null;
  company_name?: string | null;
  customer_need?: string | null;
  customer_emotion?: string | null;
  note?: string | null;
  success_rate?: string | null;
  next_step?: string | null;
  follow_up?: string | null;
  reply_suggestion?: string | null;
  customer_status?: string | null;
  status?: string | null;
  last_contacted_at?: string | null;
  updated_at?: string | null;
};

export function LineReplySection({
  customer,
  customerId,
  lineUserId,
  isMobile,
  showToast,
  copyWithFallback,
  onAfterLineSend,
  cardStyle,
}: {
  customer: LineReplyCustomer;
  customerId: string;
  lineUserId: string | null;
  isMobile: boolean;
  showToast: (message: string) => void;
  copyWithFallback: (text: string, options?: CopyWithFallbackOptions) => Promise<boolean>;
  onAfterLineSend: () => void | Promise<void>;
  cardStyle: CSSProperties;
}) {
  const [sendBusy, setSendBusy] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<LineReplyTemplateId | "">("");
  const [copyBusy, setCopyBusy] = useState(false);

  useEffect(() => {
    setReplyDraft(dedupeGreetingPrefix(buildAiLineFollowUpReply(customer, "zh")));
    setSelectedTemplate("");
  }, [customer.id, customer.updated_at, customer.customer_name, customer.company_name]);

  function applyTemplate(templateId: LineReplyTemplateId) {
    setSelectedTemplate(templateId);
    setReplyDraft(buildLineReplyTemplateContent(templateId, customer));
  }

  async function copyReplyMessage() {
    const msg = replyDraft.trim();
    if (!msg || copyBusy) {
      if (!msg) showToast("請先輸入訊息內容");
      return;
    }
    setCopyBusy(true);
    await copyWithFallback(msg, {
      title: "複製訊息",
      description: "若無法自動複製，請點下方按鈕",
      tapLabel: "點此複製",
      closeLabel: "關閉",
      copiedLabel: "已複製！",
      onSuccess: () => showToast("已複製訊息"),
    });
    setCopyBusy(false);
  }

  async function handleSendToLine() {
    const boundLineUserId = lineUserId?.trim() ?? "";
    const msg = replyDraft.trim();
    if (!boundLineUserId) {
      showToast("請先綁定 LINE 官方帳號，或於上方選擇帳號");
      return;
    }
    if (!msg) {
      showToast("請先輸入訊息內容");
      return;
    }
    if (sendBusy) return;

    setSendBusy(true);
    try {
      const res = await fetch("/api/line/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          line_user_id: boundLineUserId,
          message: msg,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        showToast(body.error ? `LINE 傳送失敗：${body.error}` : "LINE 傳送失敗");
        return;
      }
      await onAfterLineSend();
      showToast("已透過 LINE 傳送訊息");
    } catch (err) {
      console.error("[LineReplySection] send-message failed:", err);
      showToast("LINE 傳送失敗");
    } finally {
      setSendBusy(false);
    }
  }

  const boundLineUserId = lineUserId?.trim() ?? "";
  const hasReplyText = Boolean(replyDraft.trim());
  const canSendToLine = Boolean(boundLineUserId && hasReplyText);

  const btn: CSSProperties = {
    flex: isMobile ? "1 1 100%" : "1 1 auto",
    padding: "10px 16px",
    borderRadius: ui.radiusMd,
    border: `1px solid rgba(255,255,255,0.14)`,
    background: "rgba(0,0,0,0.22)",
    color: ui.text,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    boxSizing: "border-box",
  };

  return (
    <section style={cardStyle} aria-label="LINE 回覆訊息">
      <h2
        style={{
          margin: "0 0 12px",
          fontSize: dt.compactSection,
          fontWeight: 800,
          color: "#c7d2fe",
        }}
      >
        LINE 回覆訊息
      </h2>
      <label
        style={{
          display: "block",
          marginBottom: 6,
          fontSize: dt.labelUpper,
          fontWeight: 700,
          color: ui.faint,
        }}
      >
        常用模板
      </label>
      <select
        value={selectedTemplate}
        onChange={(e) => {
          const value = e.target.value;
          if (!value) {
            setSelectedTemplate("");
            return;
          }
          applyTemplate(value as LineReplyTemplateId);
        }}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: ui.radiusMd,
          border: `1px solid ${ui.borderStrong}`,
          background: "rgba(0,0,0,0.28)",
          color: ui.text,
          fontSize: 13,
          marginBottom: 10,
          boxSizing: "border-box",
        }}
      >
        <option value="">— 選擇模板 —</option>
        {LINE_REPLY_TEMPLATES.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.label}
          </option>
        ))}
      </select>
      <textarea
        value={replyDraft}
        onChange={(e) => {
          setReplyDraft(e.target.value);
          setSelectedTemplate("");
        }}
        placeholder="輸入或編輯要傳送的 LINE 訊息…"
        aria-label="LINE 回覆訊息"
        style={{
          width: "100%",
          minHeight: isMobile ? 120 : 140,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.32)",
          color: ui.text,
          fontSize: dt.paragraph,
          lineHeight: dt.lineHeightBody,
          resize: "vertical",
          boxSizing: "border-box",
          fontFamily: "inherit",
          outline: "none",
          marginBottom: 10,
        }}
      />
      <p style={{ margin: "0 0 10px", fontSize: dt.meta, color: ui.faint, lineHeight: dt.lineHeight }}>
        預設為 AI 建議文案，可直接修改後傳送。
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          style={{
            ...btn,
            opacity: hasReplyText && !copyBusy ? 1 : 0.5,
            cursor: hasReplyText && !copyBusy ? "pointer" : "not-allowed",
          }}
          disabled={!hasReplyText || copyBusy}
          onClick={() => void copyReplyMessage()}
        >
          {copyBusy ? "處理中…" : "複製訊息"}
        </button>
        <button
          type="button"
          style={{
            ...btn,
            border: `1px solid rgba(6,199,85,0.55)`,
            background: `linear-gradient(135deg, ${LINE_BRAND}, #05a849)`,
            color: "#fff",
            opacity: canSendToLine && !sendBusy ? 1 : 0.5,
            cursor: canSendToLine && !sendBusy ? "pointer" : "not-allowed",
          }}
          disabled={!canSendToLine || sendBusy}
          onClick={() => void handleSendToLine()}
        >
          {sendBusy ? "處理中…" : "傳送到 LINE"}
        </button>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: dt.meta, color: ui.faint, lineHeight: dt.lineHeight }}>
        {boundLineUserId
          ? "透過 LINE Messaging API 推送至已綁定的官方帳號。"
          : "請先綁定 LINE 官方帳號，或於上方選擇帳號。"}
      </p>
    </section>
  );
}
