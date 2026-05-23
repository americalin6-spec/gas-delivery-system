"use client";

import {
  CUSTOMER_SOCIAL_FIELD_KEYS,
  CUSTOMER_SOCIAL_LABELS_ZH,
  CUSTOMER_SOCIAL_OPEN_LABELS_ZH,
  resolveSocialHref,
  socialFieldHasValue,
  type CustomerSocialFieldKey,
  type CustomerSocialFields,
} from "../lib/customerSocialMedia";
import { dt } from "../lib/customerDetailTypography";

type Props = {
  customer: CustomerSocialFields;
  isMobile: boolean;
};

const ui = {
  surface: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.1)",
  text: "#f8fafc",
  muted: "#94a3b8",
  faint: "#64748b",
  accent: "#38bdf8",
};

export function CustomerSocialMediaSection({ customer, isMobile }: Props) {
  const filled = CUSTOMER_SOCIAL_FIELD_KEYS.filter((key) =>
    socialFieldHasValue(customer[key]),
  );

  if (filled.length === 0) {
    return (
      <section
        style={{
          borderRadius: 14,
          border: `1px solid ${ui.border}`,
          background: ui.surface,
          padding: isMobile ? "14px 12px" : "16px 18px",
        }}
      >
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: dt.compactSection,
            fontWeight: 700,
            color: ui.text,
          }}
        >
          社群媒體
        </h2>
        <p style={{ margin: 0, fontSize: dt.meta, color: ui.faint, lineHeight: dt.lineHeight }}>
          尚未填寫社群或網站資訊
        </p>
      </section>
    );
  }

  return (
    <section
      style={{
        borderRadius: 14,
        border: "1px solid rgba(56,189,248,0.28)",
        background:
          "linear-gradient(155deg, rgba(56,189,248,0.08) 0%, rgba(15,23,42,0.88) 100%)",
        padding: isMobile ? "14px 12px" : "16px 18px",
      }}
    >
      <h2
        style={{
          margin: "0 0 12px",
          fontSize: dt.compactSection,
          fontWeight: 700,
          color: ui.text,
          letterSpacing: "-0.01em",
        }}
      >
        社群媒體
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
          gap: isMobile ? 12 : 14,
        }}
      >
        {filled.map((key) => (
          <SocialFieldRow key={key} fieldKey={key} value={customer[key]} />
        ))}
      </div>
    </section>
  );
}

function SocialFieldRow({
  fieldKey,
  value,
}: {
  fieldKey: CustomerSocialFieldKey;
  value: string | null | undefined;
}) {
  const display = String(value ?? "").trim();
  const href = resolveSocialHref(fieldKey, display);
  const openLabel = CUSTOMER_SOCIAL_OPEN_LABELS_ZH[fieldKey];

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: dt.labelUpper,
          fontWeight: 700,
          color: ui.faint,
          marginBottom: 4,
        }}
      >
        {CUSTOMER_SOCIAL_LABELS_ZH[fieldKey]}
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 6,
            color: ui.accent,
            fontSize: dt.paragraph,
            fontWeight: 500,
            textDecoration: "none",
            wordBreak: "break-all",
          }}
        >
          <span>{display}</span>
          {openLabel ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(56,189,248,0.15)",
                border: "1px solid rgba(56,189,248,0.35)",
              }}
            >
              {openLabel} ↗
            </span>
          ) : null}
        </a>
      ) : (
        <span
          style={{
            fontSize: dt.paragraph,
            color: ui.text,
            wordBreak: "break-word",
            lineHeight: dt.lineHeight,
          }}
        >
          {display}
        </span>
      )}
    </div>
  );
}
