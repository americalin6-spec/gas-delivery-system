/**
 * Homepage AI analysis mapping — confirmed CRM fields vs inferred insights.
 *
 * Priority: labeled extraction > conversational/regex > AI fallback (contact fields only).
 * customer_need / important_date / notes never use generic AI guesses.
 */

import type { AppLang } from "./appLang";
import { emptyAnalysisDraft, type HomeAnalysisDraft } from "./homeFormDraft";
import { sanitizeImportantDateFields } from "./sanitizeImportantDateFields";
import {
  type AiAnalyzeCustomerPayload,
  extractCustomerFromLineChat,
  extractHonorificCustomerName,
  isGenericCustomerNeedPhrase,
  isNotProvidedLabel,
  isValidExtractedCustomerName,
  listCustomerNeedChipsForInsights,
  mergeConfirmedCrmExtraction,
  NAME_NOT_PROVIDED_EN,
  NAME_NOT_PROVIDED_ZH,
  sanitizeAiCustomerFields,
  toFinalMergedCustomerFields,
} from "./extractCustomerFromLineChat";
import { normalizeLineIdForDisplay } from "./lineIdDisplay";
import {
  buildExtractedPreviewDisplay,
  mergeCrmFormSnapshot,
  type CrmFormSnapshot,
} from "./mergeCrmFormFields";

const EMPTY_INSIGHT = "--";

const GENERIC_INSIGHT_RE =
  /依對話內容整理|安排下一步會議或提案|持續追蹤並確認需求|Schedule next meeting or proposal|Continue follow-up and confirm needs/i;

export type ConfirmedCrmMapping = {
  customerName: string;
  companyName: string;
  phone: string;
  lineId: string;
  email: string;
  estimatedAmount: string;
  customerNeed: string;
  note: string;
};

export type AiInferredInsights = {
  dealProbability: string;
  customerLevel: string;
  leakRisk: string;
  customerEmotion: string;
  nextStep: string;
  todo: string;
  replySuggestion: string;
  followUp: string;
  importantDate: string;
};

export type HomeAnalysisMappingResult = {
  confirmed: ConfirmedCrmMapping;
  insights: AiInferredInsights;
  analysis: HomeAnalysisDraft;
  extractedPreview: {
    customer_name: string;
    company_name: string;
    phone: string;
    line_id: string;
    email: string;
    customer_need: string;
  };
  /** True when at least one date anchor exists in the pasted chat. */
  hasExplicitImportantDate: boolean;
};

function isGenericInsightPhrase(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  return GENERIC_INSIGHT_RE.test(t) || isGenericCustomerNeedPhrase(t);
}

function isBrokenChatFragment(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  if (/^但.+/.test(t)) return true;
  if (/[；;].{2,}[：:]/u.test(t)) return true;
  if (/^[\u4e00-\u9fff]{1,4}(?:小姐|先生|女士)[：:]/u.test(t)) return true;
  if (/完全沒追蹤|沒追蹤；/u.test(t)) return true;
  return false;
}

function pickAiInsight(aiValue: string, fallback: string): string {
  const fromAi = aiValue.trim();
  if (fromAi && !isNotProvidedLabel(fromAi) && !isGenericInsightPhrase(fromAi) && !isBrokenChatFragment(fromAi)) {
    return fromAi;
  }
  return fallback;
}

function levelFromProbability(probability: string, lang: AppLang): string {
  if (lang === "zh") {
    if (probability === "高") return "A級客戶";
    if (probability === "中") return "B級客戶";
    return "C級客戶";
  }
  if (probability === "High") return "A-Level Client";
  if (probability === "Medium") return "B-Level Client";
  return "C-Level Client";
}

function leakFromProbability(probability: string, lang: AppLang): string {
  if (lang === "zh") return probability === "低" ? "高" : "低";
  return probability === "Low" ? "High" : "Low";
}

function emotionFromProbability(probability: string, lang: AppLang): string {
  if (lang === "zh") {
    return probability === "高" ? "積極、有興趣" : "還在評估";
  }
  return probability === "High" ? "Interested and responsive" : "Still evaluating";
}

function notProvided(lang: AppLang): string {
  return lang === "zh" ? "未提供" : "Not provided";
}

function pickCustomerNameForForm(
  mergedName: string,
  parserName: string,
  lineTextInput: string,
  lang: AppLang,
): string {
  const candidates = [
    parserName.trim(),
    extractHonorificCustomerName(lineTextInput),
    mergedName.trim(),
  ].filter(Boolean);

  for (const name of candidates) {
    if (isValidExtractedCustomerName(name)) {
      return name;
    }
  }

  return lang === "zh" ? NAME_NOT_PROVIDED_ZH : NAME_NOT_PROVIDED_EN;
}

function formatAddressee(customerName: string, lang: AppLang): string {
  const raw = customerName.trim();
  if (!raw || isNotProvidedLabel(raw) || /未提供|未命名/u.test(raw)) {
    return lang === "zh" ? "客戶" : "the client";
  }
  if (/先生|小姐|女士/.test(raw)) return raw;
  if (lang === "zh" && /^[\u4e00-\u9fff]{2,4}$/.test(raw)) return `${raw}小姐`;
  return raw;
}

function replySalutation(addressee: string, lang: AppLang): string {
  if (lang === "zh") {
    return addressee === "客戶" ? "您好" : `${addressee}您好`;
  }
  return addressee === "the client" ? "Hello" : `Hi ${addressee}`;
}

const TODO_TASK_PREFIX_ZH: Record<string, string> = {
  病患資料整合: "整理病患資料整合功能規劃",
  術後追蹤提醒: "規劃術後追蹤提醒",
  "預約與回診通知": "規劃預約與回診通知",
  "AI 分類客戶需求": "規劃 LINE AI 分類需求模組",
  高單價客戶標記: "標記高單價客戶流程",
  手機版: "準備手機版 demo",
  分店管理: "規劃分店管理功能",
};

function chipToTodoTask(chip: string, lang: AppLang): string {
  if (lang === "zh") {
    const mapped = TODO_TASK_PREFIX_ZH[chip];
    if (mapped) return mapped;
    if (/整合|提醒|通知|標記|管理|demo/i.test(chip)) return `規劃${chip}`;
    return `整理${chip}需求與做法`;
  }
  if (/integration|reminder|notification|mark|branch/i.test(chip)) {
    return `Plan ${chip}`;
  }
  return `Prepare ${chip}`;
}

function buildNextAction(
  chips: string[],
  lineText: string,
  customerName: string,
  lang: AppLang,
  aiSummary: string,
): string {
  const fromAi = pickAiInsight(aiSummary, "");
  if (fromAi) return fromAi;

  const needs = chips.join(lang === "zh" ? "、" : ", ");
  const hasDemo = /demo|展示|先看看|先看到/i.test(lineText);
  const hasBossMeeting = /老闆|主管|董事長|開會/i.test(lineText);
  const isClinic = /診所|醫美|病患|病歷/i.test(lineText);

  if (lang === "zh") {
    if (needs && hasDemo && hasBossMeeting) {
      if (isClinic) {
        const who = formatAddressee(customerName, lang);
        const whoLabel = who === "客戶" ? "客戶" : who;
        return `整理診所 CRM demo 與功能規劃（含${needs}），提供給${whoLabel}讓老闆開會查看。`;
      }
      return `整理 CRM demo 與功能規劃（${needs}），提供給${formatAddressee(customerName, lang)}供老闆開會參考。`;
    }
    if (needs) {
      return `依客戶需求（${needs}）整理方案重點與下一步交付內容。`;
    }
    if (hasDemo) {
      return "整理 demo 方向與重點說明，供客戶內部會議使用。";
    }
    return notProvided(lang);
  }

  if (needs && hasDemo && hasBossMeeting) {
    return `Prepare a CRM demo and feature outline (${needs}) for ${formatAddressee(customerName, lang)} to share before the manager's meeting.`;
  }
  if (needs) {
    return `Summarize next deliverables based on: ${needs}.`;
  }
  return notProvided(lang);
}

function buildTodoItems(chips: string[], lang: AppLang, aiValue: string): string {
  const fromAi = pickAiInsight(aiValue, "");
  if (fromAi && fromAi.includes("\n")) return fromAi;

  if (chips.length === 0) return notProvided(lang);

  const tasks = chips.map((chip) => `• ${chipToTodoTask(chip, lang)}`);
  return tasks.join("\n");
}

function buildReplySuggestion(
  chips: string[],
  customerName: string,
  lineText: string,
  lang: AppLang,
  aiValue: string,
): string {
  const fromAi = pickAiInsight(aiValue, "");
  if (fromAi && !/^您好，我們會依您的需求提供完整說明與報價。$/.test(fromAi)) {
    return fromAi;
  }

  const needs = chips.join(lang === "zh" ? "、" : ", ");
  const addressee = formatAddressee(customerName, lang);
  const salutation = replySalutation(addressee, lang);
  const hasDemo = /demo|展示/i.test(lineText);
  const hasBoss = /老闆|主管|開會/i.test(lineText);
  const isClinic = /診所|醫美/i.test(lineText);

  if (lang === "zh") {
    if (needs && hasDemo && hasBoss) {
      const product = isClinic ? "診所 CRM demo 與功能規劃" : "CRM demo 與功能規劃";
      return `${salutation}，我會先依照您提到的${needs}，整理一版${product}，方便您提供給老闆開會參考。`;
    }
    if (needs) {
      return `${salutation}，我會先依照您提到的${needs}整理說明與建議方案，再與您確認細節。`;
    }
    return `${salutation}，感謝您的詢問，我們會依對話內容整理說明後回覆您。`;
  }

  if (needs && hasDemo) {
    return `${salutation}, I will prepare a CRM demo and feature outline covering ${needs} for your review.`;
  }
  return `${salutation}, thank you for your message — we will follow up with a tailored summary shortly.`;
}

function buildFollowUpStrategy(chips: string[], lineText: string, lang: AppLang, aiValue: string): string {
  const fromAi = pickAiInsight(aiValue, "");
  if (fromAi && !isBrokenChatFragment(fromAi)) return fromAi;

  const hasDemo = /demo|展示|先看看|先看到/i.test(lineText);
  const hasBoss = /老闆|主管|開會/i.test(lineText);
  const hasTimeline = /本週|這週|下週|兩週|週內/i.test(lineText);

  if (lang === "zh") {
    if (hasDemo && hasBoss) {
      return "可在本週內提供 demo 方向，並主動確認老闆看完後是否需要安排進一步簡報。";
    }
    if (hasDemo) {
      return "提供 demo 初稿後主動確認客戶回饋與下一步時程。";
    }
    if (hasTimeline && chips.length > 0) {
      return `依${chips[0]}等需求，本週主動確認進度與決策窗口。`;
    }
    if (chips.length > 0) {
      return "一週內主動確認需求理解是否正確，並詢問是否進入報價或 demo 階段。";
    }
    return notProvided(lang);
  }

  if (hasDemo && hasBoss) {
    return "Share the demo direction this week and confirm whether leadership wants a follow-up briefing.";
  }
  return notProvided(lang);
}

/**
 * Build confirmed CRM fields + inferred insight cards for homepage analyze.
 */
export function buildHomeAnalysisMapping(
  lineText: string,
  lang: AppLang,
  aiResult: AiAnalyzeCustomerPayload | null | undefined,
  dealProbability: string,
  existingForm?: CrmFormSnapshot,
): HomeAnalysisMappingResult {
  const extracted = extractCustomerFromLineChat(lineText, lang);
  const honorific = extractHonorificCustomerName(lineText);
  if (honorific && !extracted.customer_name) {
    extracted.customer_name = honorific;
  }

  const sanitizedAi = sanitizeAiCustomerFields(aiResult, lang);
  const aiAmount =
    aiResult?.estimatedAmount != null ? String(aiResult.estimatedAmount).trim() : "";

  const { profile, note, estimatedAmount } = mergeConfirmedCrmExtraction(
    lineText,
    lang,
    extracted,
    sanitizedAi,
    { estimatedAmount: aiAmount },
  );

  const mergedFields = toFinalMergedCustomerFields(profile);
  const formName = pickCustomerNameForForm(
    mergedFields.customerName,
    extracted.customer_name,
    lineText,
    lang,
  );

  const refDate = new Date();

  const needChips = listCustomerNeedChipsForInsights(mergedFields.customerNeed, lineText, lang);
  const customerNeedDisplay = mergedFields.customerNeed || notProvided(lang);

  const aiSummary = String(aiResult?.summary ?? aiResult?.nextStep ?? "").trim();

  const nextStep = buildNextAction(needChips, lineText, formName, lang, aiSummary);
  const todo = buildTodoItems(needChips, lang, "");
  const replySuggestion = buildReplySuggestion(needChips, formName, lineText, lang, "");
  const followUp = buildFollowUpStrategy(needChips, lineText, lang, "");

  const lineId = normalizeLineIdForDisplay(mergedFields.lineId);

  const incomingForm: CrmFormSnapshot = {
    customerName: formName,
    companyName: mergedFields.companyName,
    phone: mergedFields.phone,
    lineId,
    email: mergedFields.email,
    note: note || customerNeedDisplay,
  };

  const mergedForm = existingForm
    ? mergeCrmFormSnapshot(existingForm, incomingForm)
    : incomingForm;

  const confirmed: ConfirmedCrmMapping = {
    customerName: mergedForm.customerName,
    companyName: mergedForm.companyName,
    phone: mergedForm.phone,
    lineId: mergedForm.lineId,
    email: mergedForm.email,
    estimatedAmount: estimatedAmount || notProvided(lang),
    customerNeed: customerNeedDisplay,
    note: mergedForm.note,
  };

  const analysisDraft: HomeAnalysisDraft = {
    ...emptyAnalysisDraft(),
    customerName: formName || "--",
    dealProbability,
    customerLevel: levelFromProbability(dealProbability, lang),
    leakRisk: leakFromProbability(dealProbability, lang),
    estimatedAmount: confirmed.estimatedAmount,
    customerNeed: confirmed.customerNeed,
    importantDate: EMPTY_INSIGHT,
    customerEmotion: emotionFromProbability(dealProbability, lang),
    nextStep,
    todo,
    replySuggestion,
    followUp,
  };

  const sanitized = sanitizeImportantDateFields(
    { ...analysisDraft, ...(aiResult ?? {}) },
    lineText,
    lang,
    refDate,
  );
  const importantDateForUi = sanitized.important_date || EMPTY_INSIGHT;

  const insights: AiInferredInsights = {
    dealProbability,
    customerLevel: levelFromProbability(dealProbability, lang),
    leakRisk: leakFromProbability(dealProbability, lang),
    customerEmotion: emotionFromProbability(dealProbability, lang),
    importantDate: importantDateForUi,
    nextStep,
    todo,
    followUp,
    replySuggestion,
  };

  const analysis: HomeAnalysisDraft = {
    ...analysisDraft,
    importantDate: importantDateForUi,
  };

  return {
    confirmed,
    insights,
    analysis,
    hasExplicitImportantDate: sanitized.hasExplicitImportantDate,
    extractedPreview: buildExtractedPreviewDisplay(
      {
        customer_name: formName || extracted.customer_name,
        company_name: mergedFields.companyName,
        phone: mergedFields.phone,
        line_id: lineId,
        email: mergedFields.email,
        customer_need: customerNeedDisplay,
      },
      existingForm ?? {
        customerName: "",
        companyName: "",
        phone: "",
        lineId: "",
        email: "",
        note: "",
      },
    ),
  };
}
