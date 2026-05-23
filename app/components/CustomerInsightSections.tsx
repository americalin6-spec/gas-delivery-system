"use client";

import type { CSSProperties, ReactNode } from "react";
import type { AppLang } from "../lib/appLang";
import {
  parseTodoBulletItems,
  resolveDisplayImportantDate,
  resolveVerifiedFollowUpYmd,
} from "../lib/crmCustomerDisplay";
import { formatFollowUpDateDisplay } from "../lib/followUpReminders";
import { followUpModeBadgeMeta, normalizeFollowUpMode } from "../lib/followUpMode";
import { dt } from "../lib/customerDetailTypography";

const MUTED = "rgba(226,232,240,0.72)";
const TEXT = "#f1f5f9";
const BORDER = "rgba(255,255,255,0.08)";

const sectionBlock: CSSProperties = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: `1px solid ${BORDER}`,
};

const sectionLabel: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: MUTED,
  marginBottom: 8,
};

const bodyText: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.65,
  color: TEXT,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

const clampText: CSSProperties = {
  ...bodyText,
  display: "-webkit-box",
  WebkitLineClamp: 4,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

function displayOrDash(value: string | null | undefined, empty = "-"): string {
  const t = value?.trim();
  if (!t || t === "-" || t === "--") return empty;
  return t;
}

export type CustomerInsightSectionsProps = {
  lang: AppLang;
  sourceText: string;
  labels: {
    todo: string;
    replySuggestion: string;
    followUp: string;
    aiSend: string;
    followUpReminder?: string;
    note: string;
    noExplicitDate: string;
    importantDate?: string;
  };
  todo?: string | null;
  reply_suggestion?: string | null;
  follow_up?: string | null;
  follow_up_mode?: string | null;
  follow_up_date?: unknown;
  note?: string | null;
  manualFollowUpYmd?: string | null;
  showImportantDate?: boolean;
  showFollowUpReminder?: boolean;
  showNote?: boolean;
  clampLongText?: boolean;
  /** Larger type on customer detail page only */
  textScale?: "default" | "detail";
};

export function CustomerInsightSections({
  lang,
  sourceText,
  labels,
  todo,
  reply_suggestion,
  follow_up,
  follow_up_mode,
  follow_up_date,
  note,
  manualFollowUpYmd,
  showImportantDate = false,
  showFollowUpReminder = false,
  showNote = true,
  clampLongText = true,
  textScale = "default",
}: CustomerInsightSectionsProps) {
  const labelStyle: CSSProperties =
    textScale === "detail"
      ? { fontSize: dt.label, fontWeight: 700, letterSpacing: "0.04em", color: MUTED, marginBottom: 8 }
      : sectionLabel;
  const bodyStyle: CSSProperties =
    textScale === "detail"
      ? {
          margin: 0,
          fontSize: dt.paragraph,
          lineHeight: dt.lineHeightBody,
          color: TEXT,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }
      : bodyText;
  const clampStyle: CSSProperties =
    textScale === "detail"
      ? {
          ...bodyStyle,
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }
      : clampText;
  const importantDisplay = showImportantDate
    ? resolveDisplayImportantDate(sourceText, lang, new Date(), undefined)
    : null;
  const followYmd = resolveVerifiedFollowUpYmd(follow_up_date, sourceText, {
    manualOverrideYmd: manualFollowUpYmd,
  });
  const todoItems = parseTodoBulletItems(todo);
  const replyText = displayOrDash(reply_suggestion, "-");
  const followText = displayOrDash(follow_up, "-");
  const noteText = displayOrDash(note, "-");
  const modeMeta = followUpModeBadgeMeta(normalizeFollowUpMode(follow_up_mode), lang);
  const textStyle = clampLongText ? clampStyle : bodyStyle;

  function InsightSection({ label, children }: { label: string; children: ReactNode }) {
    return (
      <div style={sectionBlock}>
        <div style={labelStyle}>{label}</div>
        {children}
      </div>
    );
  }

  return (
    <div style={{ minWidth: 0 }}>
      {showImportantDate && importantDisplay ? (
        <InsightSection label={labels.importantDate ?? (lang === "zh" ? "重要日期" : "Important date")}>
          <p style={bodyStyle}>{importantDisplay}</p>
        </InsightSection>
      ) : null}

      <InsightSection label={`${labels.todo}：`}>
        {todoItems.length > 0 ? (
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: textScale === "detail" ? dt.paragraph : 15,
              lineHeight: textScale === "detail" ? dt.lineHeightBody : 1.65,
              color: TEXT,
            }}
          >
            {todoItems.map((item) => (
              <li key={item} style={{ marginBottom: 4 }}>
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p style={bodyStyle}>-</p>
        )}
      </InsightSection>

      <InsightSection label={`${labels.replySuggestion}：`}>
        <p style={textStyle}>{replyText}</p>
      </InsightSection>

      <InsightSection label={`${labels.followUp}：`}>
        <p style={textStyle}>{followText}</p>
      </InsightSection>

      <InsightSection label={`${labels.aiSend}：`}>
        <p style={{ ...bodyStyle, fontWeight: 600 }}>{modeMeta.label}</p>
      </InsightSection>

      {showFollowUpReminder ? (
        <InsightSection label={`${labels.followUpReminder}：`}>
          <p style={bodyStyle}>
            {followYmd
              ? `${formatFollowUpDateDisplay(followYmd, lang)} (${followYmd})`
              : labels.noExplicitDate}
          </p>
        </InsightSection>
      ) : null}

      {showNote ? (
        <InsightSection label={`${labels.note}：`}>
          <p style={bodyStyle}>{noteText}</p>
        </InsightSection>
      ) : null}
    </div>
  );
}
