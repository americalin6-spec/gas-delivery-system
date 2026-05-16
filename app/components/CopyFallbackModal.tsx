"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { copyToClipboardSync } from "../lib/copyToClipboard";

export type CopyFallbackModalProps = {
  open: boolean;
  text: string;
  title?: string;
  description?: string;
  tapLabel?: string;
  closeLabel?: string;
  copiedLabel?: string;
  isMobile?: boolean;
  onClose: () => void;
  onCopied?: () => void | Promise<void>;
};

export function CopyFallbackModal({
  open,
  text,
  title = "Copy message",
  description = "Automatic copy is not available on this device. Tap the button below, then paste into LINE.",
  tapLabel = "Tap to Copy",
  closeLabel = "Close",
  copiedLabel = "Copied!",
  isMobile = false,
  onClose,
  onCopied,
}: CopyFallbackModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tapState, setTapState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (!open) {
      setTapState("idle");
      return;
    }
    const t = window.setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.select();
      try {
        el.setSelectionRange(0, el.value.length);
      } catch {
        /* ignore */
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, text]);

  const handleTapCopy = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.select();
      try {
        el.setSelectionRange(0, el.value.length);
      } catch {
        /* ignore */
      }
    }

    const ok = copyToClipboardSync(text);
    if (ok) {
      setTapState("copied");
      void Promise.resolve(onCopied?.());
      return;
    }
    setTapState("failed");
  }, [text, onCopied]);

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
    border: "1px solid rgba(129,140,248,0.35)",
    background: "linear-gradient(165deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.99) 100%)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
    padding: isMobile ? 22 : 28,
    boxSizing: "border-box",
    color: "#f8fafc",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="copy-fallback-title" onClick={onClose}>
      <div
        style={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="copy-fallback-title" style={{ margin: "0 0 10px", fontSize: isMobile ? 20 : 22, fontWeight: 800 }}>
          {title}
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 15, lineHeight: 1.55, color: "#94a3b8" }}>{description}</p>

        <textarea
          ref={textareaRef}
          readOnly
          value={text}
          style={{
            width: "100%",
            minHeight: isMobile ? 140 : 160,
            maxHeight: 240,
            padding: 16,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.35)",
            color: "#f8fafc",
            fontSize: 16,
            lineHeight: 1.55,
            resize: "vertical",
            boxSizing: "border-box",
            WebkitUserSelect: "text",
            userSelect: "text",
          }}
        />

        <button
          type="button"
          onClick={handleTapCopy}
          style={{
            width: "100%",
            marginTop: 18,
            padding: isMobile ? "18px 20px" : "16px 22px",
            borderRadius: 14,
            border: "none",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: isMobile ? 18 : 17,
            color: "#0f172a",
            background:
              tapState === "copied"
                ? "linear-gradient(135deg,#86efac,#22c55e)"
                : "linear-gradient(135deg,#a5b4fc,#6366f1)",
            boxShadow: "0 12px 32px rgba(99,102,241,0.4)",
            minHeight: 52,
          }}
        >
          {tapState === "copied"
            ? copiedLabel
            : tapState === "failed"
              ? `${tapLabel} (select text above)`
              : tapLabel}
        </button>

        {tapState === "failed" ? (
          <p style={{ margin: "12px 0 0", fontSize: 14, color: "#fcd34d", lineHeight: 1.45 }}>
            Long-press the text box and choose Copy, then paste into LINE.
          </p>
        ) : null}

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
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
