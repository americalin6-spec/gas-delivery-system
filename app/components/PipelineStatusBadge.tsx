"use client";

import type { CSSProperties } from "react";
import type { AppLang } from "../lib/appLang";
import {
  normalizePipelineStatus,
  pipelineStatusLabel,
  pipelineStatusVisual,
  type PipelineStatus,
} from "../lib/pipelineStatus";

type Size = "sm" | "md";

type Props = {
  status: PipelineStatus | unknown;
  lang: AppLang;
  size?: Size;
  style?: CSSProperties;
  title?: string;
};

export default function PipelineStatusBadge({ status, lang, size = "md", style, title }: Props) {
  const s = normalizePipelineStatus(status);
  const v = pipelineStatusVisual(s);
  const label = pipelineStatusLabel(s, lang);

  const padding = size === "sm" ? "5px 10px" : "8px 14px";
  const fontSize = size === "sm" ? 12 : 14;

  return (
    <span
      title={title || label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding,
        borderRadius: 999,
        fontSize,
        fontWeight: 700,
        background: v.bg,
        color: v.color,
        border: `1px solid ${v.border}`,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: v.columnAccent,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
