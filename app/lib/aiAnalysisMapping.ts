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
  resolveDisplayedCustomerNeeds,
  sanitizeAiCustomerFields,
  toFinalMergedCustomerFields,
} from "./extractCustomerFromLineChat";
import { normalizeLineIdForDisplay } from "./lineIdDisplay";
import { sanitizeCustomerFacingLineReply, sanitizeCustomerFacingText } from "./customerFacingText";
import {
  buildExtractedPreviewDisplay,
  EMPTY_CRM_FORM_SNAPSHOT,
  mergeCrmFormSnapshot,
  validateCrmFormSnapshotForDisplay,
  type CrmFormSnapshot,
} from "./mergeCrmFormFields";

const EMPTY_INSIGHT = "--";

const GENERIC_INSIGHT_RE =
  /依對話內容整理|安排下一步會議或提案|持續追蹤並確認需求|Schedule next meeting or proposal|Continue follow-up and confirm needs/i;

export type ConfirmedCrmMapping = {
  customerName: string;
  companyName: string;
  industry: string;
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
    industry: string;
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

function isHighProbabilityTier(probability: string): boolean {
  const t = probability.trim();
  return t === "高" || /^high$/i.test(t);
}

function isMediumProbabilityTier(probability: string): boolean {
  const t = probability.trim();
  return t === "中" || /^medium$|^mid$/i.test(t);
}

function isLowProbabilityTier(probability: string): boolean {
  const t = probability.trim();
  return t === "低" || /^low$/i.test(t);
}

function toDealProbabilityTier(raw: string, lang: AppLang): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (lang === "zh") {
    if (/^高$/.test(value) || isHighProbabilityTier(value)) return "高";
    if (/^中$/.test(value) || isMediumProbabilityTier(value)) return "中";
    if (/^低$/.test(value) || isLowProbabilityTier(value)) return "低";
  } else {
    if (isHighProbabilityTier(value)) return "High";
    if (isMediumProbabilityTier(value)) return "Medium";
    if (isLowProbabilityTier(value)) return "Low";
  }

  const lower = value.toLowerCase();
  if (/成交機率|deal probability|probability/i.test(value)) {
    if (/高|high/.test(lower)) return lang === "zh" ? "高" : "High";
    if (/中|medium|mid/.test(lower)) return lang === "zh" ? "中" : "Medium";
    if (/低|low/.test(lower)) return lang === "zh" ? "低" : "Low";
  }

  const pct = value.match(/(\d{1,3})\s*%/);
  if (pct) {
    const n = Number(pct[1]);
    if (Number.isFinite(n)) {
      if (n >= 70) return lang === "zh" ? "高" : "High";
      if (n >= 40) return lang === "zh" ? "中" : "Medium";
      return lang === "zh" ? "低" : "Low";
    }
  }

  if (/很高|極高|very high|strong interest|ready to (?:buy|close|sign)/i.test(value)) {
    return lang === "zh" ? "高" : "High";
  }
  if (/偏低|很低|very low|unlikely|no budget|just looking/i.test(value)) {
    return lang === "zh" ? "低" : "Low";
  }

  return null;
}

/** Keyword fallback when AI does not return a usable dealProbability tier. */
export function heuristicDealProbabilityFromLineText(text: string, lang: AppLang): string {
  const t = text.toLowerCase();
  let score = 0;

  const highSignals = [
    "預算", "報價", "兩週", "本週", "下週", "月底", "下個月", "一定要", "需要", "想做", "麻煩", "急",
    "合作", "簽約", "下訂", "訂金", "成交", "確定要", "就要", "看房", "付訂",
    "budget", "quotation", "proposal", "within", "need", "urgent", "please send", "sounds good",
    "contract", "deposit", "ready to buy", "sign",
  ];

  const lowSignals = [
    "先問問", "只是看看", "還不確定", "沒有預算", "先了解", "再看看", "比較一下", "觀望",
    "just asking", "just looking", "not sure", "no budget", "exploring", "compare",
  ];

  for (const w of highSignals) {
    if (t.includes(w.toLowerCase())) score += 1;
  }
  for (const w of lowSignals) {
    if (t.includes(w.toLowerCase())) score -= 2;
  }

  if (score >= 3) return lang === "zh" ? "高" : "High";
  if (score >= 1) return lang === "zh" ? "中" : "Medium";
  return lang === "zh" ? "低" : "Low";
}

function resolveDealProbabilityFromAi(
  aiResult: AiAnalyzeCustomerPayload | null | undefined,
  lang: AppLang,
  heuristicFallback: string,
): string {
  const raw = aiResult as Record<string, unknown> | null | undefined;
  const fromAi = String(raw?.dealProbability ?? raw?.deal_probability ?? raw?.success_rate ?? "").trim();
  if (!fromAi || isNotProvidedLabel(fromAi)) {
    return heuristicFallback;
  }
  return toDealProbabilityTier(fromAi, lang) ?? heuristicFallback;
}

function resolveCustomerEmotionFromAi(
  aiResult: AiAnalyzeCustomerPayload | null | undefined,
  lang: AppLang,
  probabilityFallback: string,
): string {
  const raw = aiResult as Record<string, unknown> | null | undefined;
  const fromAi = String(
    raw?.customerMood ?? raw?.customerEmotion ?? raw?.customer_emotion ?? "",
  ).trim();
  if (fromAi && !isNotProvidedLabel(fromAi)) {
    return sanitizeCustomerFacingText(fromAi);
  }
  return emotionFromProbability(probabilityFallback, lang);
}

function notProvided(lang: AppLang): string {
  return lang === "zh" ? "未提供" : "Not provided";
}

const HONORIFIC_NAME_IN_TEXT_RE = /([\u4e00-\u9fff]{1,4})(先生|小姐|女士)/gu;

function listHonorificNamesInText(text: string): string[] {
  const names = new Set<string>();
  const t = String(text ?? "").trim();
  if (!t) return [];
  HONORIFIC_NAME_IN_TEXT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HONORIFIC_NAME_IN_TEXT_RE.exec(t)) !== null) {
    const candidate = `${m[1]}${m[2]}`;
    if (isValidExtractedCustomerName(candidate)) {
      names.add(candidate);
    }
  }
  return [...names];
}

function aiInsightConflictsWithConversation(
  aiText: string,
  lineText: string,
  canonicalName: string,
): boolean {
  const fromAi = aiText.trim();
  if (!fromAi) return false;
  const aiNames = listHonorificNamesInText(fromAi);
  if (aiNames.length === 0) return false;
  const allowed = new Set([canonicalName, ...listHonorificNamesInText(lineText)]);
  return aiNames.some((name) => !allowed.has(name));
}

/** Keep CRM form + insight cards aligned with the current pasted conversation only. */
export function reconcileAnalysisToConversationIdentity(
  lineText: string,
  lang: AppLang,
  canonicalName: string,
  needChips: string[],
  analysis: HomeAnalysisDraft,
): HomeAnalysisDraft {
  const canonical = canonicalName.trim();
  const insightKeys: (keyof HomeAnalysisDraft)[] = [
    "nextStep",
    "replySuggestion",
    "followUp",
    "todo",
    "customerNeed",
  ];

  let mixed =
    Boolean(canonical) &&
    isValidExtractedCustomerName(canonical) &&
    analysis.customerName.trim() !== canonical;

  if (!mixed && canonical) {
    for (const key of insightKeys) {
      const value = String(analysis[key] ?? "").trim();
      if (value && aiInsightConflictsWithConversation(value, lineText, canonical)) {
        mixed = true;
        break;
      }
    }
  }

  if (!mixed) {
    return canonical ? { ...analysis, customerName: canonical } : analysis;
  }

  return {
    ...analysis,
    customerName: canonical || analysis.customerName,
    nextStep: buildNextAction(needChips, lineText, canonical, lang, ""),
    todo: buildTodoItems(lineText, needChips, lang, ""),
    replySuggestion: buildReplySuggestion(needChips, canonical, lineText, lang, ""),
    followUp: buildFollowUpStrategy(needChips, lineText, lang, ""),
  };
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

const CRM_SAAS_NEED_CHIP_RE =
  /病患|病歷|術後|追蹤提醒|回診|分類需求|高單價|手機版|分店管理|CRM|demo|展示/i;

function conversationNeedSignals(lineText: string, chips: string[]): string {
  return `${lineText}\n${chips.join("\n")}`;
}

function extractBudgetPhraseForReply(blob: string): string {
  const range = blob.match(
    /(?:預算\s*(?:大概|約)?\s*)?(\d+(?:\.\d+)?)\s*萬\s*(?:到|至|~|～|—|-)\s*(\d+(?:\.\d+)?)\s*萬/u,
  );
  if (range?.[1] && range[2]) {
    return `${range[1]}萬到${range[2]}萬左右的預算`;
  }

  const labeled = blob.match(/預算\s*(?:大概|約)?\s*(\d+(?:\.\d+)?)\s*萬/u);
  if (labeled?.[1]) {
    return `${labeled[1]}萬左右的預算`;
  }

  const standalone = blob.match(/(?:^|[\s，,；;])(\d+(?:\.\d+)?)\s*萬(?:左右|上下)?/u);
  if (standalone?.[1]) {
    return `${standalone[1]}萬左右的預算`;
  }

  return "";
}

function abstractChipThemeForReply(chip: string): string {
  const c = chip.trim();
  if (!c || c.length > 24) return "";

  if (/預算|萬/u.test(c)) return "";
  if (/三房|四房|兩房|两房/u.test(c)) {
    return c.match(/三房|四房|兩房|两房/u)?.[0] ?? "";
  }
  if (/高鐵|高铁|捷運|捷运|MRT|HSR|火車站|通勤|分鐘|分钟/u.test(c)) {
    return "交通便利性";
  }
  if (/車位|停車|平面/u.test(c)) return "車位配置";
  if (/病患|病歷|回診|預約|術後/u.test(c)) return "診所流程銜接";
  if (/醫美|美学|美學|療程|諮詢|咨询/u.test(c)) return "療程與諮詢安排";
  if (/保單|保障|理賠|保險/u.test(c)) return "保障規劃方向";
  if (/demo|展示/i.test(c)) return "實際操作驗證";
  if (/分店|連鎖|多店/u.test(c)) return "多據點協作";
  if (/手機|行動|mobile/i.test(c)) return "行動端使用";
  if (/上線|官网|官網|網站|系统|系統|功能/u.test(c)) return "功能與上線需求";
  if (/整合|CRM|提醒|分類/u.test(c)) return "流程整合需求";
  if (c.length <= 10 && !/[。；;]/.test(c)) return c;

  return "";
}

function formatAckThemePhrase(theme: string): string {
  if (/預算$/u.test(theme)) return theme;
  if (/^[\d.]+萬/u.test(theme)) return `${theme}左右的預算`;
  return theme;
}

function buildRequirementAcknowledgement(
  lineText: string,
  chips: string[],
  lang: AppLang,
): string {
  if (lang !== "zh") return "";

  const blob = conversationNeedSignals(lineText, chips);
  const themes: string[] = [];
  const seen = new Set<string>();

  const add = (phrase: string) => {
    const p = phrase.trim();
    if (!p || seen.has(p)) return;
    seen.add(p);
    themes.push(p);
  };

  const budget = extractBudgetPhraseForReply(blob);
  if (budget) add(budget);

  const layout = blob.match(/三房|四房|兩房|两房/u)?.[0];
  if (layout) add(layout);

  if (/高鐵|高铁|捷運|捷运|MRT|HSR|火車站|通勤/u.test(blob)) {
    add("交通便利性");
  }

  if (/車位|停車|平面車位/u.test(blob)) {
    add("車位配置");
  }

  for (const chip of chips) {
    if (themes.length >= 3) break;
    const abstract = abstractChipThemeForReply(chip);
    if (abstract) add(abstract);
  }

  if (themes.length === 0) return "";

  const picked = themes.slice(0, 3).map(formatAckThemePhrase);

  if (picked.length === 1) {
    const only = picked[0]!;
    return /預算$/u.test(only)
      ? `依照您目前${only}`
      : `依照您目前${only}的需求`;
  }

  if (picked.length === 2) {
    const [first, second] = picked;
    const secondPart = /預算$/u.test(second!)
      ? second!
      : `${second}的需求`.replace(/的需求的需求/u, "的需求");
    return /預算$/u.test(first!)
      ? `依照您目前${first}，以及${secondPart}`
      : `依照您目前${first}，以及${second}的需求`;
  }

  const [first, second, third] = picked;
  const tail =
    /預算$/u.test(third!) ? third! : third;
  const middle = /預算$/u.test(second!) ? second! : second;
  return `依照您目前${first}，以及${middle}與${tail}的需求`;
}

type ProfessionalReplyInsight = {
  opening: string;
  followThrough: string;
};

function inferPropertyBuyerReplyInsight(blob: string): ProfessionalReplyInsight {
  const hasFamilyLayout = /三房|四房|兩房|家人|小孩|學區|学区/u.test(blob);
  const hasTransit = /高鐵|高铁|捷運|通勤|MRT|HSR|火車站/u.test(blob);
  const hasCommunity = /社區|社区|健身房|游泳池|泳池/u.test(blob);
  const hasParking = /車位|停車|平面/u.test(blob);
  const isOwnerOccupier = /自住|換屋|居住|一家|家人|長期/u.test(blob);
  const isInvestment = /投資|收租|轉售|置產/u.test(blob);
  const isUpgrade = /換屋|改善|更大/u.test(blob);

  if (isInvestment && !isOwnerOccupier) {
    return {
      opening: "從您的規劃來看，這次應該是以區位與中長期配置為核心在評估。",
      followThrough:
        "我會先幫您聚焦在值得深入比較的標的，整理實際成本與後續彈性，方便您做判斷。",
    };
  }

  if ((isOwnerOccupier || isUpgrade) && hasFamilyLayout && (hasTransit || hasCommunity)) {
    return {
      opening:
        "看得出來您這次換屋除了空間規劃之外，也很重視日常動線與家人生活的便利性。",
      followThrough:
        "我會先從這個角度幫您挑出值得深入了解的選項，再約時間一起細聊或安排看房。",
    };
  }

  if ((isOwnerOccupier || isUpgrade) && hasFamilyLayout) {
    return {
      opening: "從您的規劃來看，目前應該是在評估長期自住、以家庭生活為核心的安排。",
      followThrough:
        "我會先整理幾個生活機能與使用節奏都較契合的方向，再和您確認哪些值得進一步了解。",
    };
  }

  if (hasTransit && hasCommunity) {
    return {
      opening:
        "整體感覺您在意的不只是物件本身，而是通勤節奏與社區環境能否真正貼合生活型態。",
      followThrough: "我會依這個方向先篩一輪，再整理值得優先看的方案給您參考。",
    };
  }

  if (hasParking && hasFamilyLayout) {
    return {
      opening: "看得出來您在意的除了室內空間，也包含日常使用的順暢度與實際入住感受。",
      followThrough:
        "我會先幫您聚焦在日常動線較順、後續也較好安排的選項，再一起確認下一步。",
    };
  }

  if (hasCommunity) {
    return {
      opening: "從對話中能感受到，您希望找的不只是房型，而是能支撐日常節奏的居住環境。",
      followThrough: "我會先從生活機能與社區氛圍幫您縮小範圍，再安排後續比較。",
    };
  }

  if (hasTransit) {
    return {
      opening: "看得出來通勤與區位連結，是您這次選擇中很關鍵的一環。",
      followThrough: "我會先從動線與區段幫您挑出值得看的方向，再整理重點供您參考。",
    };
  }

  if (/預算|萬|看房|建案/u.test(blob)) {
    return {
      opening: "從您目前的考量來看，應該是在找一個能真正符合生活節奏、而不是只看規格的方案。",
      followThrough:
        "我會先依這個方向幫您篩選並整理重點，再和您確認哪些需要進一步了解。",
    };
  }

  return {
    opening: "看得出來您這次選物業，重視的是整體居住感受而不只是單一條件。",
    followThrough: "我會先依對話脈絡整理幾個方向，再和您確認後續安排。",
  };
}

function inferCrmEvalReplyInsight(
  blob: string,
  isClinic: boolean,
  hasDemo: boolean,
  hasBoss: boolean,
): ProfessionalReplyInsight {
  const hasPatientFlow = /病患|病歷|術後|回診|預約/u.test(blob);
  const hasBranch = /分店|連鎖/u.test(blob);
  const hasMobile = /手機版|mobile/i.test(blob);

  if (isClinic && hasPatientFlow) {
    return {
      opening: "看得出來您關心的不只是功能清單，而是診所實際流程能否順利落地。",
      followThrough: hasDemo
        ? "我會先整理一版貼近診所日常操作的示範重點，再和您確認哪些部分需要優先驗證。"
        : "我會先從實際流程角度整理可行方向，再和您確認優先順序。",
    };
  }

  if (hasDemo && hasBoss) {
    return {
      opening: "從您的安排來看，這次應該需要一份能讓決策者快速掌握重點的說明。",
      followThrough: isClinic
        ? "我會先整理一版貼近診所情境的示範重點，方便您帶進會議討論。"
        : "我會先整理一版決策者容易理解的示範重點，方便您帶進會議討論。",
    };
  }

  if (hasBranch) {
    return {
      opening: "看得出來您目前在評估的，是多據點能否一致運作，而不只是單店功能。",
      followThrough: "我會先從分店協作與管理節奏整理可行方向，再和您確認 demo 重點。",
    };
  }

  if (hasMobile) {
    return {
      opening: "從對話脈絡來看，行動端使用情境應該是您這次評估的重要一環。",
      followThrough: "我會先整理貼近實際使用情境的說明，再和您確認後續驗證方式。",
    };
  }

  if (hasDemo) {
    return {
      opening: "感覺您目前是在確認方案是否真的能解決日常操作上的痛點，而不只是先看功能。",
      followThrough: "我會先整理一版貼近實際情境的示範方向，再和您確認下一步。",
    };
  }

  if (/整合|提醒|分類|CRM/i.test(blob)) {
    return {
      opening: "看得出來您這次評估的重點，是流程能否真正減少人工、而不是增加負擔。",
      followThrough: "我會先從實際使用情境整理可行方向，再和您確認優先驗證項目。",
    };
  }

  return {
    opening: "從對話內容來看，您應該是在評估哪種做法最適合目前的營運節奏。",
    followThrough: "我會先依這個方向整理重點，再和您確認後續安排。",
  };
}

function inferGenericSalesReplyInsight(
  blob: string,
  chips: string[],
  hasDemo: boolean,
  hasBoss: boolean,
): ProfessionalReplyInsight {
  const hasTimeline = /本週|這週|下週|兩週|週內|月底/u.test(blob);
  const hasQuote = /報價|價格|預算|方案/u.test(blob);

  if (hasDemo && hasBoss) {
    return {
      opening: "從您的安排來看，這次需要一份能讓決策者快速理解價值與可行性的說明。",
      followThrough: "我會先整理一版重點摘要，方便您帶進會議，再一起確認後續步驟。",
    };
  }

  if (hasDemo) {
    return {
      opening: "感覺您目前是在確認方案是否真的能貼近實際使用，而不只是先看表面功能。",
      followThrough: "我會先整理一版貼近情境的示範方向，再和您確認下一步。",
    };
  }

  if (hasTimeline && hasQuote) {
    return {
      opening: "看得出來您這次除了方案內容，也在意時程能否配合目前的決策節奏。",
      followThrough: "我會先整理可行做法與時程選項，再和您確認哪個方向最合適。",
    };
  }

  if (chips.length > 0 || blob.trim()) {
    return {
      opening: "從對話脈絡來看，您目前應該是在找一個能真正貼近實際狀況的做法。",
      followThrough: "我會先依這個方向整理重點與可行選項，再和您確認後續安排。",
    };
  }

  return {
    opening: "感謝您的詢問，我會先依對話內容整理方向。",
    followThrough: "整理後再和您確認細節與下一步。",
  };
}

function inferProfessionalReplyInsight(
  lineText: string,
  chips: string[],
  lang: AppLang,
  options: { isClinic: boolean; hasDemo: boolean; hasBoss: boolean },
): ProfessionalReplyInsight {
  if (lang !== "zh") {
    const blob = conversationNeedSignals(lineText, chips);
    if (options.hasDemo && options.hasBoss) {
      return {
        opening: "It sounds like you need something leadership can review quickly, not just a feature list.",
        followThrough:
          "I will prepare a concise briefing aligned with your situation, then confirm next steps with you.",
      };
    }
    if (options.hasDemo) {
      return {
        opening: "It seems you are validating fit for how you actually work day to day.",
        followThrough: "I will outline a practical demo direction and follow up to align on next steps.",
      };
    }
    if (blob.trim() || chips.length > 0) {
      return {
        opening: "Based on our conversation, I understand the decision context you are working within.",
        followThrough: "I will pull together a focused summary and confirm the best next step with you.",
      };
    }
    return {
      opening: "Thank you for reaching out.",
      followThrough: "I will review our conversation and follow up with a tailored summary.",
    };
  }

  const blob = conversationNeedSignals(lineText, chips);
  if (isPropertyBuyerConversation(lineText, chips)) {
    return inferPropertyBuyerReplyInsight(blob);
  }
  if (isCrmProductEvaluationConversation(lineText, chips)) {
    return inferCrmEvalReplyInsight(blob, options.isClinic, options.hasDemo, options.hasBoss);
  }
  return inferGenericSalesReplyInsight(blob, chips, options.hasDemo, options.hasBoss);
}

function composeProfessionalReply(
  salutation: string,
  insight: ProfessionalReplyInsight,
  lang: AppLang,
  lineText = "",
  chips: string[] = [],
): string {
  if (lang === "zh") {
    const ack = buildRequirementAcknowledgement(lineText, chips, lang);
    if (ack) {
      return `${salutation}，${ack}，${insight.followThrough}`;
    }
    return `${salutation}，${insight.opening}${insight.followThrough}`;
  }
  return `${salutation}, ${insight.opening} ${insight.followThrough}`;
}

function isPropertyBuyerConversation(lineText: string, chips: string[]): boolean {
  const blob = conversationNeedSignals(lineText, chips);
  if (CRM_SAAS_NEED_CHIP_RE.test(blob) && /診所|醫美|病患|demo/i.test(blob)) {
    return false;
  }
  return /預算|萬|房|厅|廳|車位|建案|新建案|高鐵|高铁|捷運|看房|買房|購屋|平面|社區|学区|學區/u.test(
    blob,
  );
}

type TodoIndustry = "insurance" | "website" | "medical_beauty" | "crm_saas" | "real_estate" | "generic";

const REAL_ESTATE_TODO_RE =
  /建案|新建案|看房|買房|購屋|換屋|自住|三房|四房|两房|兩房|車位|高鐵|高铁|捷運|社區|社区|学区|學區|坪|透天|別墅|套房|華廈|物件|平面車位/u;

const INSURANCE_TODO_RE =
  /保險|保单|保單|保障|理賠|保費|壽險|醫療險|意外險|年金|投保|underwriting|\binsurance\b|\bpolicy\b/i;

const WEBSITE_TODO_RE =
  /網站|官網|官网|website|建站|網頁|页面|SEO|RWD|上線|功能需求|系統開發|系統开发|後台|后台|前台|UI|UX|web\s*dev/i;

const MEDICAL_BEAUTY_TODO_RE =
  /診所|醫美|诊所|療程|諮詢|咨询|皮秒|音波|回診|預約|術後|美容|美学|美學|拉皮|微整|護理/u;

function isInsuranceTodoConversation(lineText: string, chips: string[]): boolean {
  return INSURANCE_TODO_RE.test(conversationNeedSignals(lineText, chips));
}

function isWebsiteTodoConversation(lineText: string, chips: string[]): boolean {
  const blob = conversationNeedSignals(lineText, chips);
  if (INSURANCE_TODO_RE.test(blob)) return false;
  return WEBSITE_TODO_RE.test(blob);
}

function isMedicalBeautyTodoConversation(lineText: string, chips: string[]): boolean {
  const blob = conversationNeedSignals(lineText, chips);
  if (INSURANCE_TODO_RE.test(blob)) return false;
  if (WEBSITE_TODO_RE.test(blob)) return false;
  if (CRM_SAAS_NEED_CHIP_RE.test(blob) && /demo|CRM|整合|分店|手機版/i.test(blob)) {
    return false;
  }
  return MEDICAL_BEAUTY_TODO_RE.test(blob);
}

function isRealEstateTodoConversation(lineText: string, chips: string[]): boolean {
  const blob = conversationNeedSignals(lineText, chips);
  if (!REAL_ESTATE_TODO_RE.test(blob)) return false;
  if (INSURANCE_TODO_RE.test(blob) || WEBSITE_TODO_RE.test(blob)) return false;
  if (isCrmProductTodoConversation(lineText, chips)) return false;
  if (isMedicalBeautyTodoConversation(lineText, chips)) return false;
  return true;
}

function resolveTodoIndustry(lineText: string, chips: string[]): TodoIndustry {
  if (isInsuranceTodoConversation(lineText, chips)) return "insurance";
  if (isWebsiteTodoConversation(lineText, chips)) return "website";
  if (isCrmProductTodoConversation(lineText, chips)) return "crm_saas";
  if (isMedicalBeautyTodoConversation(lineText, chips)) return "medical_beauty";
  if (isRealEstateTodoConversation(lineText, chips)) return "real_estate";
  return "generic";
}

function buildInsuranceTodoItems(lang: AppLang): string[] {
  if (lang === "zh") {
    return [
      "整理保單方案",
      "比較保障內容",
      "準備保費試算",
      "安排保險諮詢",
    ];
  }
  return [
    "Prepare policy options",
    "Compare coverage details",
    "Draft premium estimates",
    "Schedule insurance consultation",
  ];
}

function buildWebsiteTodoItems(lang: AppLang): string[] {
  if (lang === "zh") {
    return [
      "整理功能需求",
      "準備網站架構",
      "製作報價方案",
      "安排需求訪談",
    ];
  }
  return [
    "Document feature requirements",
    "Prepare site architecture outline",
    "Draft pricing proposal",
    "Schedule requirements interview",
  ];
}

function buildMedicalBeautyTodoItems(lang: AppLang): string[] {
  if (lang === "zh") {
    return [
      "提供療程資訊",
      "安排諮詢時間",
      "說明費用方案",
      "確認客戶期待與注意事項",
    ];
  }
  return [
    "Share treatment information",
    "Schedule consultation time",
    "Explain pricing options",
    "Confirm expectations and care notes",
  ];
}

function isCrmProductEvaluationConversation(lineText: string, chips: string[]): boolean {
  const blob = conversationNeedSignals(lineText, chips);
  if (isPropertyBuyerConversation(lineText, chips)) return false;
  return (
    CRM_SAAS_NEED_CHIP_RE.test(blob) ||
    /診所|醫美|病患|病歷/i.test(blob) ||
    chips.some((chip) => Boolean(TODO_TASK_PREFIX_ZH[chip]))
  );
}

function isCrmProductTodoConversation(lineText: string, chips: string[]): boolean {
  const blob = conversationNeedSignals(lineText, chips);
  if (INSURANCE_TODO_RE.test(blob) || WEBSITE_TODO_RE.test(blob)) return false;
  return (
    CRM_SAAS_NEED_CHIP_RE.test(blob) ||
    chips.some((chip) => Boolean(TODO_TASK_PREFIX_ZH[chip])) ||
    (/診所|醫美|病患|病歷/i.test(blob) &&
      /CRM|demo|整合|分店|手機版|分類需求/i.test(blob))
  );
}

function buildPropertyBuyerTodoItems(lineText: string, chips: string[], lang: AppLang): string[] {
  const blob = conversationNeedSignals(lineText, chips);
  const hasBudget = /預算|萬/u.test(blob);
  const hasTransit = /捷運|高鐵|高铁|MRT|HSR|火車站/u.test(blob);
  const hasParking = /車位|停車|平面車位/u.test(blob);

  if (lang === "zh") {
    const tasks = [
      "篩選符合條件建案",
      "整理建案資料",
      "安排看房時間",
    ];
    if (hasBudget) {
      tasks.push("確認預算與貸款規劃");
    }
    tasks.push("準備建案比較表");
    if (hasTransit) {
      tasks.push("確認交通動線與通勤時間");
    }
    if (hasParking) {
      tasks.push("確認車位方案與總價試算");
    }
    return tasks;
  }

  const tasks = [
    "Shortlist matching listings",
    "Prepare property briefs",
    "Schedule viewings",
  ];
  if (hasBudget) tasks.push("Confirm budget and financing options");
  tasks.push("Prepare side-by-side comparison");
  if (hasTransit) tasks.push("Verify commute and transit access");
  if (hasParking) tasks.push("Confirm parking options and total price");
  return tasks;
}

function buildCrmProductTodoItems(chips: string[], lang: AppLang): string[] {
  const tasks: string[] = [];
  const seen = new Set<string>();

  const add = (task: string) => {
    const t = task.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    tasks.push(t);
  };

  for (const chip of chips) {
    if (lang === "zh") {
      const mapped = TODO_TASK_PREFIX_ZH[chip];
      if (mapped) {
        add(mapped);
        continue;
      }
      if (/整合|提醒|通知|標記|管理|demo/i.test(chip)) {
        add(`規劃${chip}功能模組`);
        continue;
      }
    } else if (/integration|reminder|notification|mark|branch/i.test(chip)) {
      add(`Plan ${chip} rollout`);
      continue;
    }
  }

  if (lang === "zh") {
    if (tasks.length === 0) {
      add("整理客戶關注功能與 demo 重點");
      add("準備方案簡報與報價架構");
      add("安排產品 demo 與決策人會議");
    } else {
      add("準備方案簡報與報價架構");
      add("安排產品 demo 與決策人會議");
    }
  } else {
    if (tasks.length === 0) {
      add("Align on priority features and demo scope");
      add("Prepare proposal deck and pricing outline");
      add("Schedule product demo with stakeholders");
    } else {
      add("Prepare proposal deck and pricing outline");
      add("Schedule product demo with stakeholders");
    }
  }

  return tasks;
}

function buildGenericSalesTodoItems(lang: AppLang): string[] {
  if (lang === "zh") {
    return [
      "確認客戶決策時程與優先條件",
      "整理可行方案與報價方向",
      "安排下次跟進與資料交付",
    ];
  }
  return [
    "Confirm decision timeline and priorities",
    "Prepare feasible options and pricing direction",
    "Schedule next follow-up and deliverables",
  ];
}

function formatTodoBulletList(tasks: string[]): string {
  return tasks.map((task) => `• ${task}`).join("\n");
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
    return `Prepare a tailored demo and feature outline (${needs}) for ${formatAddressee(customerName, lang)} to share before the manager's meeting.`;
  }
  if (needs) {
    return `Summarize next deliverables based on: ${needs}.`;
  }
  return notProvided(lang);
}

function buildTodoItems(
  lineText: string,
  chips: string[],
  lang: AppLang,
  aiValue: string,
): string {
  const fromAi = pickAiInsight(aiValue, "");
  if (fromAi && fromAi.includes("\n")) return fromAi;

  if (!lineText.trim() && chips.length === 0) return notProvided(lang);

  let tasks: string[];
  switch (resolveTodoIndustry(lineText, chips)) {
    case "insurance":
      tasks = buildInsuranceTodoItems(lang);
      break;
    case "website":
      tasks = buildWebsiteTodoItems(lang);
      break;
    case "medical_beauty":
      tasks = buildMedicalBeautyTodoItems(lang);
      break;
    case "crm_saas":
      tasks = buildCrmProductTodoItems(chips, lang);
      break;
    case "real_estate":
      tasks = buildPropertyBuyerTodoItems(lineText, chips, lang);
      break;
    default:
      tasks = buildGenericSalesTodoItems(lang);
  }

  return formatTodoBulletList(tasks);
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
    return sanitizeCustomerFacingLineReply(fromAi);
  }

  const addressee = formatAddressee(customerName, lang);
  const salutation = replySalutation(addressee, lang);
  const hasDemo = /demo|展示/i.test(lineText);
  const hasBoss = /老闆|主管|開會/i.test(lineText);
  const isClinic = /診所|醫美/i.test(lineText);
  const hasNeedContext = chips.length > 0 || Boolean(lineText.trim());

  if (hasNeedContext || lang === "zh") {
    const insight = inferProfessionalReplyInsight(lineText, chips, lang, {
      isClinic,
      hasDemo,
      hasBoss,
    });
    return sanitizeCustomerFacingLineReply(
      composeProfessionalReply(salutation, insight, lang, lineText, chips),
    );
  }

  return sanitizeCustomerFacingLineReply(
    `${salutation}, thank you for your message — I will follow up with a tailored summary shortly.`,
  );
}

function buildFollowUpStrategy(chips: string[], lineText: string, lang: AppLang, aiValue: string): string {
  const fromAi = pickAiInsight(aiValue, "");
  if (fromAi && !isBrokenChatFragment(fromAi)) {
    return sanitizeCustomerFacingText(fromAi);
  }

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
export type BuildHomeAnalysisMappingOptions = {
  /** When false (default), ignore prior form/AI CRM fields — homepage paste is isolated. */
  mergeWithPreviousForm?: boolean;
  previousForm?: CrmFormSnapshot;
};

export function buildHomeAnalysisMapping(
  lineText: string,
  lang: AppLang,
  aiResult: AiAnalyzeCustomerPayload | null | undefined,
  heuristicDealProbability?: string,
  options?: BuildHomeAnalysisMappingOptions,
): HomeAnalysisMappingResult {
  const heuristic =
    heuristicDealProbability?.trim() ||
    heuristicDealProbabilityFromLineText(lineText, lang);
  const resolvedDealProbability = resolveDealProbabilityFromAi(aiResult, lang, heuristic);
  const resolvedCustomerEmotion = resolveCustomerEmotionFromAi(
    aiResult,
    lang,
    resolvedDealProbability,
  );
  const resolvedCustomerLevel = levelFromProbability(resolvedDealProbability, lang);
  const resolvedLeakRisk = leakFromProbability(resolvedDealProbability, lang);

  const mergeWithPreviousForm = options?.mergeWithPreviousForm === true;
  const previousForm = mergeWithPreviousForm
    ? (options?.previousForm ?? EMPTY_CRM_FORM_SNAPSHOT)
    : EMPTY_CRM_FORM_SNAPSHOT;
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
  const rawAiCustomerNeeds = String(
    aiResult?.ai_customer_needs ??
      aiResult?.aiCustomerNeeds ??
      aiResult?.customerNeeds ??
      "",
  ).trim();
  const rawAiCustomerNeed = String(aiResult?.customerNeed ?? sanitizedAi.customer_need ?? "").trim();
  const customerNeedDisplay = resolveDisplayedCustomerNeeds({
    aiCustomerNeeds: rawAiCustomerNeeds,
    customerNeed: rawAiCustomerNeed,
    mergedCustomerNeed: mergedFields.customerNeed,
    lang,
  });

  const aiSummary = String(aiResult?.summary ?? "").trim();
  const aiNextStep = String(aiResult?.nextStep ?? "").trim();
  const aiReply = String(
    aiResult?.replySuggestion ?? aiResult?.professionalReply ?? aiResult?.reply ?? "",
  ).trim();
  const aiFollowUp = String(aiResult?.followUp ?? "").trim();
  const aiTodo = String(aiResult?.todo ?? "").trim();
  const aiSummaryForInsights =
    aiSummary && !aiInsightConflictsWithConversation(aiSummary, lineText, formName)
      ? aiSummary
      : "";
  const aiNextStepForInsights =
    aiNextStep && !aiInsightConflictsWithConversation(aiNextStep, lineText, formName)
      ? aiNextStep
      : "";

  const nextStep = buildNextAction(
    needChips,
    lineText,
    formName,
    lang,
    aiNextStepForInsights || aiSummaryForInsights,
  );
  const todo = buildTodoItems(lineText, needChips, lang, aiTodo);
  const replySuggestion = buildReplySuggestion(
    needChips,
    formName,
    lineText,
    lang,
    aiReply || aiNextStepForInsights || aiSummaryForInsights,
  );
  const followUp = buildFollowUpStrategy(needChips, lineText, lang, aiFollowUp || aiSummaryForInsights);

  const lineId = normalizeLineIdForDisplay(mergedFields.lineId);

  const incomingForm: CrmFormSnapshot = {
    customerName: formName,
    companyName: mergedFields.companyName,
    industry: mergedFields.industry,
    phone: mergedFields.phone,
    lineId,
    email: mergedFields.email,
    note: note || customerNeedDisplay,
  };

  const mergedForm = validateCrmFormSnapshotForDisplay(
    mergeWithPreviousForm
      ? mergeCrmFormSnapshot(previousForm, incomingForm)
      : incomingForm,
  );

  const confirmed: ConfirmedCrmMapping = {
    customerName: mergedForm.customerName,
    companyName: mergedForm.companyName,
    industry: mergedForm.industry,
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
    dealProbability: resolvedDealProbability,
    customerLevel: resolvedCustomerLevel,
    leakRisk: resolvedLeakRisk,
    estimatedAmount: confirmed.estimatedAmount,
    customerNeed: confirmed.customerNeed,
    importantDate: EMPTY_INSIGHT,
    customerEmotion: resolvedCustomerEmotion,
    nextStep,
    todo,
    replySuggestion,
    followUp,
  };

  const sanitized = sanitizeImportantDateFields(analysisDraft, lineText, lang, refDate);
  const importantDateForUi = sanitized.important_date || EMPTY_INSIGHT;

  const canonicalName =
    isValidExtractedCustomerName(formName) ? formName : mergedForm.customerName;

  const analysisBase: HomeAnalysisDraft = reconcileAnalysisToConversationIdentity(
    lineText,
    lang,
    canonicalName,
    needChips,
    {
      ...analysisDraft,
      importantDate: importantDateForUi,
    },
  );

  const insights: AiInferredInsights = {
    dealProbability: resolvedDealProbability,
    customerLevel: resolvedCustomerLevel,
    leakRisk: resolvedLeakRisk,
    customerEmotion: resolvedCustomerEmotion,
    importantDate: importantDateForUi,
    nextStep: analysisBase.nextStep,
    todo: analysisBase.todo,
    followUp: analysisBase.followUp,
    replySuggestion: analysisBase.replySuggestion,
  };

  const confirmedAligned: ConfirmedCrmMapping = {
    ...confirmed,
    customerName: analysisBase.customerName,
  };

  const extractedPreview = buildExtractedPreviewDisplay(
    {
      customer_name: analysisBase.customerName || extracted.customer_name,
      company_name: mergedForm.companyName,
      industry: mergedFields.industry,
      phone: mergedFields.phone,
      line_id: mergedForm.lineId,
      email: mergedFields.email,
      customer_need: customerNeedDisplay,
    },
    EMPTY_CRM_FORM_SNAPSHOT,
  );

  return {
    confirmed: confirmedAligned,
    insights,
    analysis: analysisBase,
    hasExplicitImportantDate: sanitized.hasExplicitImportantDate,
    extractedPreview,
  };
}
