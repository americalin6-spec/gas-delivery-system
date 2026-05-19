"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../supabase";
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
}: {
  customerId: string;
  isMobile: boolean;
  lang: AppLang;
}) {
  const copy = customerDetailCopy(lang);
  const [messages, setMessages] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from("conversations")
        .select("id, customer_id, line_user_id, message_text, direction, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (err) {
        setError(err.message);
        setMessages([]);
      } else {
        setMessages((data ?? []) as ConversationRow[]);
      }
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [customerId]);

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
      <h2
        style={{
          fontSize: 18,
          margin: 0,
          marginBottom: 16,
          color: TEXT,
          fontWeight: 700,
          letterSpacing: 0.2,
        }}
      >
        {copy.conversationsTitle}
      </h2>

      {loading ? (
        <div style={{ color: MUTED, fontSize: 15 }}>{copy.conversationsLoading}</div>
      ) : error ? (
        <div style={{ color: DANGER, fontSize: 15 }}>{error}</div>
      ) : messages.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 15 }}>{copy.conversationsEmpty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((msg) => {
            const isOutbound = isOutboundDirection(msg.direction);
            const directionLabel = isOutbound ? copy.directionOutbound : copy.directionInbound;
            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent: isOutbound ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: isMobile ? "88%" : "72%",
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
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
