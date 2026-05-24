import type { AppLang } from "./appLang";
import type { ExtractedCustomerProfile } from "./extractCustomerFromLineChat";

export type HomeAnalysisDraft = {
  customerName: string;
  dealProbability: string;
  customerLevel: string;
  leakRisk: string;
  estimatedAmount: string;
  customerNeed: string;
  importantDate: string;
  customerEmotion: string;
  nextStep: string;
  todo: string;
  replySuggestion: string;
  followUp: string;
};

export type HomeFormDraft = {
  lineText: string;
  customerName: string;
  companyName: string;
  industry: string;
  phone: string;
  lineId: string;
  email: string;
  note: string;
  analysis: HomeAnalysisDraft;
  lang: AppLang;
  extractedPreview: ExtractedCustomerProfile | null;
};

export const LINE_WORK_AI_DRAFT_KEY = "lineWorkAiDraft";

const LEGACY_DRAFT_KEYS = ["lineWorkAiHomeFormDraftV1"] as const;

const ANALYSIS_FIELD_KEYS: (keyof HomeAnalysisDraft)[] = [
  "customerName",
  "dealProbability",
  "customerLevel",
  "leakRisk",
  "estimatedAmount",
  "customerNeed",
  "importantDate",
  "customerEmotion",
  "nextStep",
  "todo",
  "replySuggestion",
  "followUp",
];

export const emptyAnalysisDraft = (): HomeAnalysisDraft => ({
  customerName: "--",
  dealProbability: "--",
  customerLevel: "--",
  leakRisk: "--",
  estimatedAmount: "--",
  customerNeed: "--",
  importantDate: "--",
  customerEmotion: "--",
  nextStep: "--",
  todo: "--",
  replySuggestion: "--",
  followUp: "--",
});

export const emptyHomeFormDraft = (): HomeFormDraft => ({
  lineText: "",
  customerName: "",
  companyName: "",
  industry: "",
  phone: "",
  lineId: "",
  email: "",
  note: "",
  analysis: emptyAnalysisDraft(),
  lang: "zh",
  extractedPreview: null,
});

function parseLineText(parsed: Record<string, unknown>): string {
  if (typeof parsed.lineText === "string") return parsed.lineText;
  if (typeof parsed.text === "string") return parsed.text;
  return "";
}

function parseLang(value: unknown): AppLang {
  return value === "en" ? "en" : "zh";
}

function parseAnalysis(value: unknown): HomeAnalysisDraft {
  const empty = emptyAnalysisDraft();
  if (!value || typeof value !== "object") return empty;
  const record = value as Record<string, unknown>;
  const result = { ...empty };
  for (const key of ANALYSIS_FIELD_KEYS) {
    if (typeof record[key] === "string") {
      result[key] = record[key] as string;
    }
  }
  return result;
}

function parseExtractedPreview(value: unknown): ExtractedCustomerProfile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const customer_name = typeof record.customer_name === "string" ? record.customer_name : "";
  const company_name = typeof record.company_name === "string" ? record.company_name : "";
  const industry = typeof record.industry === "string" ? record.industry : "";
  const phone = typeof record.phone === "string" ? record.phone : "";
  const line_id = typeof record.line_id === "string" ? record.line_id : "";
  const email = typeof record.email === "string" ? record.email : "";
  const customer_need = typeof record.customer_need === "string" ? record.customer_need : "";
  const hasContent =
    customer_name.length > 0 ||
    company_name.length > 0 ||
    industry.length > 0 ||
    phone.length > 0 ||
    line_id.length > 0 ||
    email.length > 0 ||
    customer_need.length > 0;
  return hasContent
    ? { customer_name, company_name, industry, phone, line_id, email, customer_need }
    : null;
}

function parseHomeFormDraft(parsed: Record<string, unknown>): HomeFormDraft {
  return {
    lineText: parseLineText(parsed),
    customerName: typeof parsed.customerName === "string" ? parsed.customerName : "",
    companyName: typeof parsed.companyName === "string" ? parsed.companyName : "",
    industry: typeof parsed.industry === "string" ? parsed.industry : "",
    phone: typeof parsed.phone === "string" ? parsed.phone : "",
    lineId: typeof parsed.lineId === "string" ? parsed.lineId : "",
    email: typeof parsed.email === "string" ? parsed.email : "",
    note: typeof parsed.note === "string" ? parsed.note : "",
    analysis: parseAnalysis(parsed.analysis),
    lang: parseLang(parsed.lang),
    extractedPreview: parseExtractedPreview(parsed.extractedPreview),
  };
}

function readRawDraftJson(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const primary = localStorage.getItem(LINE_WORK_AI_DRAFT_KEY);
    if (primary) return primary;
    for (const legacyKey of LEGACY_DRAFT_KEYS) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

export function readHomeFormDraft(): HomeFormDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readRawDraftJson();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parseHomeFormDraft(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function writeHomeFormDraft(draft: HomeFormDraft): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LINE_WORK_AI_DRAFT_KEY, JSON.stringify(draft));
    for (const legacyKey of LEGACY_DRAFT_KEYS) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    /* quota or private mode */
  }
}

export function clearHomeFormDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LINE_WORK_AI_DRAFT_KEY);
    for (const legacyKey of LEGACY_DRAFT_KEYS) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    /* ignore */
  }
}

/** Restore draft from localStorage, or empty fields if none saved. */
export function restoreDraft(): HomeFormDraft {
  return readHomeFormDraft() ?? emptyHomeFormDraft();
}

/** Remove persisted draft from localStorage. */
export function clearDraft(): void {
  clearHomeFormDraft();
}

/** Persist draft to localStorage. */
export function saveDraft(draft: HomeFormDraft): void {
  writeHomeFormDraft(draft);
}

export function readHomeFormDraftFromClient(): HomeFormDraft {
  if (typeof window === "undefined") return emptyHomeFormDraft();
  return restoreDraft();
}
