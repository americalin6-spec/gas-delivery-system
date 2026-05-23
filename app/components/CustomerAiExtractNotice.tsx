"use client";

import {
  AI_EXTRACT_COLUMN_LABELS_ZH,
  AI_EXTRACT_LABEL_ZH,
  formatAiExtractedAt,
  type AiExtractCustomerColumn,
} from "../lib/customerAiExtract";
import { dt } from "../lib/customerDetailTypography";

type Props = {
  extractedAt?: string | null;
  isMobile: boolean;
  lastUpdatedColumns?: string[];
};

export function CustomerAiExtractNotice({
  extractedAt,
  isMobile,
  lastUpdatedColumns,
}: Props) {
  const hasTime = Boolean(extractedAt?.trim());

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: isMobile ? "10px 12px" : "10px 14px",
        borderRadius: 12,
        border: "1px solid rgba(148,163,184,0.22)",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <span
        style={{
          fontSize: dt.meta,
          fontWeight: 700,
          color: "#c4b5fd",
          letterSpacing: "0.06em",
        }}
      >
        {AI_EXTRACT_LABEL_ZH}
      </span>
      <span style={{ fontSize: dt.meta, color: "#94a3b8" }}>
        {hasTime ? (
          <>
            更新時間
            <strong style={{ color: "#e2e8f0", fontWeight: 500, marginLeft: 6 }}>
              {formatAiExtractedAt(extractedAt)}
            </strong>
          </>
        ) : (
          "尚未從對話擷取欄位"
        )}
      </span>
      {lastUpdatedColumns && lastUpdatedColumns.length > 0 ? (
        <span
          style={{
            width: "100%",
            fontSize: dt.small,
            color: "#64748b",
            lineHeight: dt.lineHeight,
          }}
        >
          本次更新：
          {lastUpdatedColumns
            .map((col) => AI_EXTRACT_COLUMN_LABELS_ZH[col as AiExtractCustomerColumn] ?? col)
            .join("、")}
        </span>
      ) : null}
    </div>
  );
}
