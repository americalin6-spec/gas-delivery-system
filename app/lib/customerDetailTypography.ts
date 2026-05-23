/**
 * Typography scale for `/customers/[id]` only.
 * Do not import from homepage, dashboard, or customer list pages.
 */
export const dt = {
  lineHeight: 1.75,
  lineHeightBody: 1.8,
  /** Section headings (h2) */
  sectionTitle: 28,
  sectionTitleMobile: 26,
  /** Card / panel titles */
  cardTitle: 20,
  cardTitleMobile: 18,
  /** Paragraph and field values */
  paragraph: 17,
  body: 18,
  /** Field labels inside cards */
  label: 14,
  labelUpper: 13,
  meta: 13,
  small: 12,
  /** Page header */
  pageH1: 40,
  pageH1Mobile: 32,
  pageEyebrow: 15,
  compactSection: 18,
  detailValue: 18,
  metricValue: 21,
} as const;
