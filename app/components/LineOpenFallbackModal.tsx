"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { LINE_WEB_HOME } from "../lib/openLineApp";
import { copyToClipboardSync } from "../lib/copyToClipboard";

export type LineOpenFallbackModalProps = {
  open: boolean;
  lineId?: string;
  isMobile?: boolean;
  onClose: () => void;
  onCopiedId?: () => void;
};

export function LineOpenFallbackModal({
  open,
  lineId = "",
  isMobile = false,
  onClose,
  onCopiedId,
}: LineOpenFallbackModalProps) {
  const idRef = useRef<HTMLTextAreaElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const trimmedId = lineId.trim();

  useEffect(() => {
    if (!open) {
      setCopyState("idle");
      return;
    }
    const t = window.setTimeout(() => {
      const el = idRef.current;
      if (!el || !trimmedId) return;
      el.focus();
      el.select();
      try {
        el.setSelectionRange(0, el.value.length);
      } catch {
        /* ignore */
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, trimmedId]);

  const handleCopyId = useCallback(() => {
    if (!trimmedId) return;
    const el = idRef.current;
    if (el) {
      el.focus();
      el.select();
      try {
        el.setSelectionRange(0, el.value.length);
      } catch {
        /* ignore */
      }
    }
    if (copyToClipboardSync(trimmedId)) {
      setCopyState("copied");
      onCopiedId?.();
    } else {
      setCopyState("failed");
    }
  }, [trimmedId, onCopiedId]);

  if (!open) return null;

  const overlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 10000,
    background: "rgba(2,6,23,0.72)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex",
    alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center",
    padding: isMobile ? "12px 12px max(12px, env(safe-area-inset-bottom))" : 24,
    boxSizing: "border-box",
  };

  const panel: CSSProperties = {
    width: "100%",
    maxWidth: 520,
    maxHeight: isMobile ? "min(92vh, 720px)" : "min(85vh, 640px)",
    overflow: "auto",
    borderRadius: isMobile ? "20px 20px 16px 16px" : 20,
    border: "1px solid rgba(6,199,85,0.4)",
    background: "linear-gradient(165deg, rgba(6,199,85,0.12) 0%, rgba(15,23,42,0.99) 100%)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
    padding: isMobile ? 22 : 28,
    boxSizing: "border-box",
    color: "#f8fafc",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  };

  return (
    <div role="dialog" aria-modal="true" style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 10px", fontSize: isMobile ? 20 : 22, fontWeight: 800 }}>
          Open LINE manually
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 16, lineHeight: 1.55, color: "#86efac", fontWeight: 600 }}>
          在 LINE 搜尋貼上此 ID 
        </p>
        <ol
          style={{
            margin: "0 0 18px",
            paddingLeft: 22,
            fontSize: 15,
            lineHeight: 1.65,
            color: "#94a3b8",
          }}
        >
          <li>從手機主畫面開改 LINE app </li>
          <li>點選搜尋或加入好友</li>
          <li>貼上下面 LINE ID 並開始聊天</li>
        </ol>

        {trimmedId ? (
          <>
            <textarea
              ref={idRef}
              readOnly
              value={trimmedId}
              style={{
                width: "100%",
                minHeight: 56,
                padding: 14,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.35)",
                color: "#f8fafc",
                fontSize: 17,
                fontWeight: 700,
                textAlign: "center",
                boxSizing: "border-box",
                WebkitUserSelect: "text",
                userSelect: "text",
              }}
            />
            <button
              type="button"
              onClick={handleCopyId}
              style={{
                width: "100%",
                marginTop: 14,
                padding: isMobile ? "18px 20px" : "16px 22px",
                borderRadius: 14,
                border: "none",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: isMobile ? 18 : 17,
                color: "#0f172a",
                background:
                  copyState === "copied"
                    ? "linear-gradient(135deg,#86efac,#22c55e)"
                    : "linear-gradient(135deg,#6ee7b7,#06C755)",
                minHeight: 52,
              }}
            >
            {copyState === "copied"
            ? "已複製 LINE ID！"
            : copyState === "failed"
            ? "點我複製 LINE ID"
            : "複製 LINE ID"}
          </>
        ) : (
          <p style={{ margin: "0 0 18px", fontSize: 15, color: "#fcd34d" }}>
          尚未設定 LINE ID，請先到編輯頁新增。
          </p>
        )}

        <a
          href={LINE_WEB_HOME}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            marginTop: 14,
            padding: "14px 18px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(0,0,0,0.22)",
            color: "#e2e8f0",
            fontWeight: 600,
            fontSize: 15,
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          在瀏覽器開啟 LINE
        </a>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "14px 18px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "transparent",
            color: "#cbd5e1",
            fontWeight: 600,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          關閉
        </button>
      </div>
    </div>
  );
}
