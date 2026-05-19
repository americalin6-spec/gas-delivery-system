"use client";

import type { CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import {
  normalizePipelineStatus,
  pipelineStatusLabel,
  pipelineStatusVisual,
  PIPELINE_STATUSES,
  type PipelineStatus,
} from "../lib/pipelineStatus";

type Variant = "segmented" | "select";

type Props = {
  value: PipelineStatus | unknown;
  onChange: (next: PipelineStatus) => void;
  lang: AppLang;
  variant?: Variant;
  disabled?: boolean;
  size?: "sm" | "md";
  style?: CSSProperties;
};

export default function PipelineStatusSelect({
  value,
  onChange,
  lang,
  variant = "segmented",
  disabled,
  size = "md",
  style,
}: Props) {
  const current = normalizePipelineStatus(value);

  if (variant === "select") {
    return (
      <select
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as PipelineStatus)}
        style={{
          padding: size === "sm" ? "8px 10px" : "12px 14px",
          borderRadius: 10,
          border: "1px solid rgba(148,163,184,0.4)",
          background: "rgba(15,23,42,0.85)",
          color: "white",
          fontSize: size === "sm" ? 14 : 16,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          ...style,
        }}
      >
        {PIPELINE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {pipelineStatusLabel(s, lang)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div
      role="radiogroup"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        ...style,
      }}
    >
      {PIPELINE_STATUSES.map((s) => {
        const active = s === current;
        const v = pipelineStatusVisual(s);
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(s)}
            style={{
              padding: size === "sm" ? "8px 12px" : "10px 16px",
              borderRadius: 999,
              border: `1px solid ${active ? v.columnAccent : "rgba(148,163,184,0.3)"}`,
              background: active ? v.bg : "transparent",
              color: active ? v.color : "rgba(226,232,240,0.78)",
              fontSize: size === "sm" ? 13 : 14,
              fontWeight: 700,
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "background 120ms ease, border-color 120ms ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              lineHeight: 1.2,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: v.columnAccent,
                opacity: active ? 1 : 0.6,
              }}
            />
            {pipelineStatusLabel(s, lang)}
          </button>
        );
      })}
    </div>
  );
}
