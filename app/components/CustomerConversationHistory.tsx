"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppLang } from "../lib/appLang";
import { customerDetailCopy } from "../lib/customersI18n";

type ConversationRow = {
  id: string | number;
  customer_id: string | null;
  line_user_id: string;
  message_text: string;
  direction: string;
  created_at: string;
};

const SURFACE = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT = "#f8fafc";
const MUTED = "#94a3b8";
const INBOUND_BG = "rgba(255,255,255,0.06)";
const INBOUND_BORDER = "rgba(255,255,255,0.12)";
const OUTBOUND_BG = "rgba(99,102,241,0.18)";
const OUTBOUND_BORDER = "rgba(99,102,241,0.45)";
const DANGER = "#fecaca";
const DANGER_BORDER = "rgba(248,113,113,0.45)";
const DANGER_BG = "rgba(239,68,68,0.18)";

function formatTimestamp(iso: string, lang: AppLang): string {
  try {
    return new Date(iso).toLocaleString(lang === "zh" ? "zh-TW" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function isOutboundDirection(direction: string): boolean {
  return String(direction ?? "").trim().toLowerCase() === "outbound";
}

export function CustomerConversationHistory({
  customerId,
  isMobile,
  lang,
  refreshSignal,
}: {
  customerId: string;
  isMobile: boolean;
  lang: AppLang;
  /** Bump to force a refetch (e.g. after the page logs a new outbound message). */
  refreshSignal?: number;
}) {
  const copy = customerDetailCopy(lang);
  const [messages, setMessages] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const load = useCallback(async () => {
    const id = customerId?.trim();
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const url = `/api/conversations?customer_id=${encodeURIComponent(id)}`;
      console.log("[CustomerConversationHistory] fetching:", { customerId: id, url });

      const res = await fetch(url, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: ConversationRow[];
        error?: string;
      };

      if (!res.ok || !body.ok) {
        const message = body.error || `HTTP ${res.status}`;
        console.error("[CustomerConversationHistory] fetch error:", {
          customerId: id,
          status: res.status,
          error: message,
        });
        setError(message);
        setMessages([]);
        return;
      }

      const rows = body.rows ?? [];
      console.log("[CustomerConversationHistory] rows received:", {
        customerId: id,
        rowCount: rows.length,
      });
      setMessages(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[CustomerConversationHistory] threw:", message);
      setError(message);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load, refreshSignal]);

  async function handleDeleteMessage(messageId: string | number) {
    if (typeof window === "undefined") return;
    const ok = window.confirm(copy.conversationDeleteConfirm);
    if (!ok) return;

    const idStr = String(messageId);
    setPendingDeleteId(idStr);

    try {
      const res = await fetch(`/api/conversations?id=${encodeURIComponent(idStr)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        const message = body.error || `HTTP ${res.status}`;
        console.error("[CustomerConversationHistory] delete error:", { id: idStr, message });
        window.alert(message);
        return;
      }
      console.log("[CustomerConversationHistory] deleted:", { id: idStr });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[CustomerConversationHistory] delete threw:", message);
      window.alert(message);
    } finally {
      setPendingDeleteId(null);
    }
  }

  async function handleClearAll() {
    if (typeof window === "undefined") return;
    const id = customerId?.trim();
    if (!id) return;
    const ok = window.confirm(copy.conversationClearAllConfirm);
    if (!ok) return;

    setClearingAll(true);

    try {
      const res = await fetch(
        `/api/conversations?customer_id=${encodeURIComponent(id)}&all=1`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deletedCount?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        const message = body.error || `HTTP ${res.status}`;
        console.error("[CustomerConversationHistory] clear all error:", { customerId: id, message });
        window.alert(message);
        return;
      }
      console.log("[CustomerConversationHistory] cleared all:", {
        customerId: id,
        deletedCount: body.deletedCount,
      });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[CustomerConversationHistory] clear all threw:", message);
      window.alert(message);
    } finally {
      setClearingAll(false);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <section
      style={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: isMobile ? 20 : 28,
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.06) inset, 0 18px 48px rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            fontSize: 18,
            margin: 0,
            color: TEXT,
            fontWeight: 700,
            letterSpacing: 0.2,
          }}
        >
          {copy.conversationsTitle}
        </h2>
        {hasMessages ? (
          <button
            type="button"
            onClick={handleClearAll}
            disabled={clearingAll}
            style={{
              border: `1px solid ${DANGER_BORDER}`,
              background: DANGER_BG,
              color: DANGER,
              borderRadius: 10,
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              cursor: clearingAll ? "not-allowed" : "pointer",
              opacity: clearingAll ? 0.6 : 1,
            }}
          >
            {clearingAll ? copy.conversationDeleting : copy.conversationClearAll}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div style={{ color: MUTED, fontSize: 15 }}>{copy.conversationsLoading}</div>
      ) : error ? (
        <div style={{ color: DANGER, fontSize: 15 }}>{error}</div>
      ) : !hasMessages ? (
        <div style={{ color: MUTED, fontSize: 15 }}>{copy.conversationsEmpty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((msg) => {
            const isOutbound = isOutboundDirection(msg.direction);
            const directionLabel = isOutbound ? copy.directionOutbound : copy.directionInbound;
            const isDeleting = pendingDeleteId === String(msg.id);
            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent: isOutbound ? "flex-end" : "flex-start",
                  alignItems: "flex-start",
                  gap: 8,
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                {isOutbound ? null : (
                  <DeleteMessageButton
                    label={copy.conversationDeleteAria}
                    disabled={isDeleting}
                    onClick={() => handleDeleteMessage(msg.id)}
                    placement="leading"
                  />
                )}
                <div
                  style={{
                    maxWidth: isMobile ? "82%" : "70%",
                    background: isOutbound ? OUTBOUND_BG : INBOUND_BG,
                    border: `1px solid ${isOutbound ? OUTBOUND_BORDER : INBOUND_BORDER}`,
                    color: TEXT,
                    borderRadius: 14,
                    padding: "10px 14px",
                    boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                  }}
                >
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: 15,
                      lineHeight: 1.5,
                    }}
                  >
                    {msg.message_text}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: MUTED,
                      textAlign: isOutbound ? "right" : "left",
                    }}
                  >
                    {directionLabel} · {formatTimestamp(msg.created_at, lang)}
                  </div>
                </div>
                {isOutbound ? (
                  <DeleteMessageButton
                    label={copy.conversationDeleteAria}
                    disabled={isDeleting}
                    onClick={() => handleDeleteMessage(msg.id)}
                    placement="trailing"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DeleteMessageButton({
  label,
  disabled,
  onClick,
  placement,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  placement: "leading" | "trailing";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        marginTop: 4,
        order: placement === "leading" ? -1 : 1,
        width: 28,
        height: 28,
        borderRadius: 999,
        border: `1px solid ${DANGER_BORDER}`,
        background: DANGER_BG,
        color: DANGER,
        fontSize: 14,
        lineHeight: "1",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        flex: "0 0 auto",
      }}
    >
      ×
    </button>
  );
}
