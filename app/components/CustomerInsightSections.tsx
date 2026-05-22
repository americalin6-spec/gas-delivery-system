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

function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={sectionBlock}>
      <div style={sectionLabel}>{label}</div>
      {children}
    </div>
  );
}

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
}: CustomerInsightSectionsProps) {
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
  const textStyle = clampLongText ? clampText : bodyText;

  return (
    <div style={{ minWidth: 0 }}>
      {showImportantDate && importantDisplay ? (
        <Section label={labels.importantDate ?? (lang === "zh" ? "重要日期" : "Important date")}>
          <p style={bodyText}>{importantDisplay}</p>
        </Section>
      ) : null}

      <Section label={`${labels.todo}：`}>
        {todoItems.length > 0 ? (
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 15,
              lineHeight: 1.65,
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
          <p style={bodyText}>-</p>
        )}
      </Section>

      <Section label={`${labels.replySuggestion}：`}>
        <p style={textStyle}>{replyText}</p>
      </Section>

      <Section label={`${labels.followUp}：`}>
        <p style={textStyle}>{followText}</p>
      </Section>

      <Section label={`${labels.aiSend}：`}>
        <p style={{ ...bodyText, fontWeight: 600 }}>{modeMeta.label}</p>
      </Section>

      {showFollowUpReminder ? (
        <Section label={`${labels.followUpReminder}：`}>
          <p style={bodyText}>
            {followYmd
              ? `${formatFollowUpDateDisplay(followYmd, lang)} (${followYmd})`
              : labels.noExplicitDate}
          </p>
        </Section>
      ) : null}

      {showNote ? (
        <Section label={`${labels.note}：`}>
          <p style={bodyText}>{noteText}</p>
        </Section>
      ) : null}
    </div>
  );
}
