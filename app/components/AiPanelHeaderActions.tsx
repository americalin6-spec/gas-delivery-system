"use client";

import type { CSSProperties } from "react";

type Props = {
  loading: boolean;
  onReanalyze: () => void;
  buttonStyle?: CSSProperties;
};

/** Header action row: reanalyze control only (no badges/pills). */
export function AiPanelHeaderActions({ loading, onReanalyze, buttonStyle }: Props) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
      <button
        type="button"
        onClick={onReanalyze}
        disabled={loading}
        style={buttonStyle}
      >
        {loading ? "分析中…" : "重新分析"}
      </button>
    </div>
  );
}
