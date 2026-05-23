/**
 * LINE chat → CRM field extraction (deterministic pipeline).
 *
 * Order: STEP 1 phone / LINE / email → STEP 2 company → STEP 3 customer name
 */

import type { AppLang } from "./appLang";
import {
  LINE_ID_FIELD_SPEAKER_RE,
  normalizeLineIdForDisplay,
} from "./lineIdDisplay";

export type ExtractedCustomerProfile = {
  customer_name: string;
  company_name: string;
  phone: string;
  line_id: string;
  email: string;
  customer_need: string;
};

export type CustomerDataValidation = {
  data: ExtractedCustomerProfile;
  warnings: string[];
};

export type ExtractionDebugPayload = {
  extractedName: string;
  extractedCompany: string;
  extractedPhone: string;
  extractedLineId: string;
  confidence: number;
};

const EMPTY: ExtractedCustomerProfile = {
  customer_name: "",
  company_name: "",
  phone: "",
  line_id: "",
  email: "",
  customer_need: "",
};

export const NAME_NOT_PROVIDED_ZH = "未提供姓名";
export const NAME_NOT_PROVIDED_EN = "Name not provided";

/** Lines that may only yield company_name — never customer_name. */
const COMPANY_ONLY_LINE_RE =
  /我們公司|我们公司|我公司|我司|本公司|公司名稱|公司名称|公司叫做|公司叫|我們是|我们是|本公司是|本公司叫|就寫|可以寫|店名|品牌叫|品牌是|健身房叫|診所是|诊所是|診所叫|诊所叫|我們診所|我们诊所|我們店|我们店/i;

/** Business/store words often appearing inside natural brand names. */
const BUSINESS_IN_NAME_RE =
  /健身|俱樂部|俱乐部|咖啡|診所|诊所|牙醫|牙医|美學|美学|工作室|餐廳|餐厅|酒楼|酒家|品牌|門市|门市|醫美|瑜珈|瑜伽|沙龍|沙龙|復健|复健|中心|俱樂|餐飲|集团|集團|公司|飯店|饭店|Gym|Studio|gym|studio/i;

const COMPANY_CANDIDATE_REJECT_RE =
  /預算|報價|报价|電話|手機|phone|LINE|email|萬元|万元|合作|簽約|签约|報價單|明天|後天|后天|週一|周一|需要|想要|可以嗎|可以吗|沒問題|没问题|謝謝|谢谢|好的|了解|知道了/i;

const COMPANY_CANDIDATE_REJECT_EXACT = new Set([
  "好了",
  "可以",
  "沒問題",
  "没问题",
  "謝謝",
  "谢谢",
  "好的",
  "嗯",
  "對",
  "了解",
  "知道了",
  "是我",
  "是我們",
]);

const COMPANY_SUFFIX_RE =
  /([\u4e00-\u9fffA-Za-z0-9&·・（）()\-\s]{0,40}?(?:股份有限公司|有限公司|工作室)|[\u4e00-\u9fffA-Za-z0-9&·\s.\-]{0,40}?(?:Studio|Media|studio|media))/giu;

/** Longer intro phrases first (e.g. 我們公司是 before 我們公司). */
const COMPANY_PREFIX_STRIP_RE =
  /^(?:就寫|可以寫|寫成|改為|改成|我們診所叫|我们诊所叫|我們診所是|我们诊所是|我們診所|我们诊所|我們店名是|我们店名是|我們店是|我们店是|我們店叫|我们店叫|我們店|我们店|診所叫|诊所叫|診所是|诊所是|我們公司叫做|我们公司叫做|我們公司是|我们公司是|我公司是|我司是|公司名稱為|公司名称为|公司叫做|公司名為|公司名为|店名是|店名为|店名叫|品牌是|品牌叫|品牌名为|我們品牌叫|我们品牌叫|我們健身房叫|我们健身房叫|我們公司叫|我们公司叫|我公司叫|公司叫|我們公司|我们公司|我公司|我們是|我们是|我是|本公司叫|本公司是|本公司|我司叫|我司是|我司|這裡是|这边是|這邊是|叫)+/u;

/** Leftover connectors after intro strip (我們公司 + 是 → company name). */
const COMPANY_LEADING_FILLER_RE = /^(?:是|為|为|叫做|名为|名為)+/u;

const NAME_FORBIDDEN_RE =
  /公司|有限公司|工作室|攝影|摄影|美學|美学|Studio|Media|股份|學院|学院|媒體|媒体|攝棚|租棚|報價|报价/i;

const NAME_BLACKLIST_EXACT = new Set([
  "叫晨光美",
  "晨光美",
  "我們公司",
  "我们公司",
  "我們是",
  "我们是",
  "本公司",
  "我司",
  "公司叫",
  "未提供",
  "未提供姓名",
]);

const NAME_BLACKLIST_CONTAINS = ["叫晨光美", "晨光美", "我們公司", "我们公司", "我們是", "我们是", "有限公司", "工作室"];

/** Common words that must never be treated as customer names (e.g. 我在 IG → 在). */
const NAME_STOPWORDS_EXACT = new Set([
  "在",
  "有",
  "想",
  "我們",
  "我们",
  "今天",
  "最近",
  "我",
  "你",
  "他",
  "她",
  "它",
  "的",
  "了",
  "是",
  "不",
  "嗎",
  "吗",
  "呢",
  "吧",
  "啊",
  "喔",
  "哦",
  "嗯",
  "好",
  "對",
  "对",
  "看",
  "到",
  "說",
  "说",
  "會",
  "会",
  "能",
  "要",
  "請",
  "请",
  "問",
  "问",
  "嗨",
  "欸",
  "喂",
  "這個",
  "这个",
  "那個",
  "那个",
  "一下",
  "謝謝",
  "谢谢",
  "了解",
  "知道",
  "好的",
  "沒問題",
  "没问题",
  "看到",
  "看到們",
  "看到你們",
  "ID",
  "LINE",
  "LINE ID",
]);

const GREETING_NAME_TOKENS = new Set([
  "哈囉",
  "哈嘍",
  "你好",
  "您好",
  "請問",
  "在嗎",
  "嗨",
  "hi",
  "hello",
  "hey",
  "在不在",
  "有人嗎",
  "早安",
  "午安",
  "晚安",
  "喂",
  "安安",
]);

// ——— Utilities ———

function stripLineArtifacts(line: string): string {
  return line
    .replace(/^\[\d{4}[/／.-]\d{1,2}[/／.-]\d{1,2}(?:\s+[^\]]+)?\]\s*/u, "")
    .replace(/^\d{1,2}:\d{2}(?::\d{2})?\s+/, "")
    .trim();
}

function splitChatLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map(stripLineArtifacts)
    .map((l) => l.trim())
    .filter(Boolean);
}

const COMPANY_SUFFIX_HINT_RE = /(?:股份有限公司|有限公司|工作室|Studio|Media)/i;

const SELF_INTRO_NAME_RE =
  /我姓[\u4e00-\u9fff]{1,2}|我叫[\u4e00-\u9fff]{2,4}|我是[\u4e00-\u9fff]{1,3}(?:先生|小姐)|可以叫我[\u4e00-\u9fff]{1,3}(?:先生|小姐)?|[\u4e00-\u9fff]{1,3}(?:先生|小姐|經理|经理)|(?:I'm|I am|my name is|call me)\s+[A-Za-z]/iu;

/** Greeting honorifics: 王先生、陳小姐、張經理 — line start or after punctuation / 您好. */
const HONORIFIC_NAME_LINE_RE =
  /^([\u4e00-\u9fff]{1,3})(先生|小姐|經理|经理)(?:您好|你好|好)?(?:[，,！!？?.。\s]|$|的)/u;

/** 您好，王先生 / …聯絡王先生 — honorific not at string start. */
const HONORIFIC_NAME_INLINE_RE =
  /(?:^|[，,。．\s])([\u4e00-\u9fff]{1,3})(先生|小姐|經理|经理)(?:您好|你好|好)?(?:[，,！!？?.。\s]|$|的)/u;

export function isCompanyOnlyLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (SELF_INTRO_NAME_RE.test(t)) return false;
  if (COMPANY_ONLY_LINE_RE.test(t) && !SELF_INTRO_NAME_RE.test(t)) return true;
  if (/公司/.test(t) && COMPANY_SUFFIX_HINT_RE.test(t) && !SELF_INTRO_NAME_RE.test(t)) return true;
  return false;
}

export function normalizeCompanyName(value: string): string {
  let s = value.trim();
  s = s.replace(COMPANY_PREFIX_STRIP_RE, "");
  s = s.replace(COMPANY_LEADING_FILLER_RE, "");
  s = s.replace(/^[「『"'（(]+|[」』"'）)]+$/gu, "");
  s = s.replace(/[，。,.;；:：！!？?]+$/u, "");
  return s.trim();
}

function stripHonorifics(name: string): string {
  return name.replace(/(小姐|先生|經理|经理|主任|總監|总监)$/u, "").trim();
}

export function isNotProvidedLabel(value: string): boolean {
  const n = value.trim();
  if (!n || n === "--" || n === "-" || n === "—") return true;
  const lower = n.toLowerCase();
  return (
    n === "未提供" ||
    n === "未偵測" ||
    n === NAME_NOT_PROVIDED_ZH ||
    lower === "not provided" ||
    lower === "not detected" ||
    lower === NAME_NOT_PROVIDED_EN.toLowerCase() ||
    lower === "n/a" ||
    lower === "na"
  );
}

export function isGreetingName(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;
  const compact = raw.replace(/[！!？?。.,，~～\s]/g, "").toLowerCase();
  if (GREETING_NAME_TOKENS.has(compact) || GREETING_NAME_TOKENS.has(raw)) return true;
  return false;
}

function isBlacklistedName(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;
  if (NAME_BLACKLIST_EXACT.has(raw)) return true;
  const core = stripHonorifics(raw);
  if (NAME_BLACKLIST_EXACT.has(core)) return true;
  for (const frag of NAME_BLACKLIST_CONTAINS) {
    if (raw.includes(frag) || core.includes(frag)) return true;
  }
  return false;
}

function hasForbiddenNameToken(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;
  if (NAME_FORBIDDEN_RE.test(raw)) return true;
  if (NAME_FORBIDDEN_RE.test(stripHonorifics(raw))) return true;
  if (/^叫/.test(raw) || /^叫/.test(stripHonorifics(raw))) return true;
  return false;
}

function isRejectedChineseNameToken(token: string): boolean {
  const core = stripHonorifics(token.trim());
  if (!core) return true;
  if (NAME_STOPWORDS_EXACT.has(core)) return true;
  if (/[0-9@#]|IG|FB|LINE|http|www\.|\.com/i.test(token)) return true;
  if (/^(?:我|你|他|她|它|咱|俺|咱們|咱们|大家|各位|這|这|那|某)/u.test(core)) return true;
  if (/(?:看到|想要|需要|可以|應該|应该|覺得|觉得|知道|了解|請問|请问)/u.test(core)) return true;
  return false;
}

/** Strict validator — used before CRM save and after extraction. */
export function isValidExtractedCustomerName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || isNotProvidedLabel(trimmed)) return false;
  if (isGreetingName(trimmed)) return false;
  if (isBlacklistedName(trimmed)) return false;
  if (hasForbiddenNameToken(trimmed)) return false;
  if (isRejectedChineseNameToken(trimmed)) return false;

  const hasHonorific = /(先生|小姐|經理|经理)$/u.test(trimmed);
  const core = stripHonorifics(trimmed);
  if (!core || core.length > 8) return false;

  if (/^(?:Dr\.|Mr\.|Ms\.|Mrs\.)\s+[A-Za-z][A-Za-z.'-]{1,29}$/i.test(trimmed)) {
    return true;
  }

  if (/^[\u4e00-\u9fff]+$/u.test(core)) {
    if (core.length < 1 || core.length > 4) return false;
    if (!hasHonorific && core.length < 2) return false;
    if (/[？?！!，,]/.test(trimmed)) return false;
    return true;
  }

  if (/^[A-Za-z][A-Za-z.'-]{0,29}$/.test(trimmed)) {
    return trimmed.length >= 2 && trimmed.length <= 30;
  }

  return false;
}

export function isValidCompanyName(value: string): boolean {
  const n = normalizeCompanyName(value);
  if (!n || n.length < 2 || n.length > 48) return false;
  if (/^(?:是|為|为|叫做|名为|名為|我們|我们|公司叫|叫)/u.test(n)) return false;
  if (/[？?]/.test(n)) return false;
  return /(有限公司|股份有限公司|工作室|Studio|Media)/i.test(n);
}

function cleanCompanyCandidate(raw: string): string {
  let s = normalizeCompanyName(raw);
  s = s.replace(/\s*(?:好了|就可以了|就行|即可|謝謝|谢谢|謝了|谢了|喔|哦|噢|嗎|吗)\s*$/u, "");
  s = s.replace(/^(?:就寫|可以寫|寫成|改為|改成)\s*/u, "");
  return s.trim();
}

/** Shop/brand/clinic names from labels or conversational context (no 有限公司 required). */
export function isValidNaturalCompanyName(
  value: string,
  opts?: { fromContextualPattern?: boolean },
): boolean {
  const n = cleanCompanyCandidate(value);
  if (!n || n.length < 2 || n.length > 28) return false;
  if (/^(?:是|為|为|叫做|名为|名為|我們|我们|公司叫|叫)/u.test(n)) return false;
  if (/[？?]/.test(n)) return false;
  if (isNotProvidedLabel(n)) return false;
  if (n === "未偵測") return false;
  if (COMPANY_CANDIDATE_REJECT_EXACT.has(n)) return false;
  if (COMPANY_CANDIDATE_REJECT_RE.test(n)) return false;
  if (/^第[一二三四五六七八九十\d]/u.test(n)) return false;
  if (/^第.+[是為为]/u.test(n)) return false;
  if (!/[\u4e00-\u9fffA-Za-z]/.test(n)) return false;
  if (!/^[\u4e00-\u9fffA-Za-z0-9&·・（）()\-]+$/u.test(n)) return false;
  if (/^(公司|品牌|店名|診所|诊所|健身房|工作室)$/.test(n)) return false;

  if (isValidCompanyName(n)) return true;

  const hasBusinessHint = BUSINESS_IN_NAME_RE.test(n);
  if (
    !opts?.fromContextualPattern &&
    !hasBusinessHint &&
    isValidExtractedCustomerName(n) &&
    n.length <= 4
  ) {
    return false;
  }
  if (!opts?.fromContextualPattern && !hasBusinessHint && n.length < 3) {
    return false;
  }

  return true;
}

/** Explicit labeled lines (公司：xxx) — allow shop/brand names without 有限公司 suffix. */
export function isValidLabeledCompanyName(value: string): boolean {
  return isValidNaturalCompanyName(value, { fromContextualPattern: true });
}

export function resolveCustomerNameForForm(raw: string, lang: string): string {
  if (!isValidExtractedCustomerName(raw)) {
    return lang === "zh" ? NAME_NOT_PROVIDED_ZH : NAME_NOT_PROVIDED_EN;
  }
  return raw.trim();
}

export function customerNameForCrm(displayName: string, lang: string): string {
  const placeholder = lang === "zh" ? NAME_NOT_PROVIDED_ZH : NAME_NOT_PROVIDED_EN;
  const trimmed = displayName.trim();
  if (!trimmed || isNotProvidedLabel(trimmed) || !isValidExtractedCustomerName(trimmed)) {
    return placeholder;
  }
  return trimmed;
}

function logExtractionDebug(payload: ExtractionDebugPayload): void {
  console.log({
    extractedName: payload.extractedName,
    extractedCompany: payload.extractedCompany,
    extractedPhone: payload.extractedPhone,
    extractedLineId: payload.extractedLineId,
    confidence: payload.confidence,
  });
}

function computeConfidence(fields: ExtractedCustomerProfile): number {
  let score = 0;
  if (fields.phone) score += 0.25;
  if (fields.line_id) score += 0.2;
  if (fields.email) score += 0.15;
  if (fields.company_name) score += 0.25;
  if (fields.customer_name && isValidExtractedCustomerName(fields.customer_name)) score += 0.15;
  return Math.min(1, Math.round(score * 100) / 100);
}

// ——— STEP 0: labeled CRM lines (客戶 / 公司 / 電話 / LINE ID / 預算 / 需求) ———

export type LabeledCrmFields = {
  customer_name: string;
  company_name: string;
  phone: string;
  line_id: string;
  email: string;
  budget: string;
  customer_need: string;
};

const LABELED_FIELD_PATTERNS: { key: keyof LabeledCrmFields; re: RegExp }[] = [
  { key: "customer_name", re: /^(?:客戶姓名|客戶名稱|客戶|聯絡人|姓名)[：:\s]\s*(.+)$/iu },
  { key: "company_name", re: /^(?:公司名稱|公司)[：:\s]\s*(.+)$/iu },
  { key: "phone", re: /^(?:電話|手機|聯絡電話|phone|tel)[：:\s]\s*(.+)$/iu },
  { key: "line_id", re: /^(?:LINE\s*ID|LINE\s*帳號|LINE|line\s*id)[：:\s]\s*(.+)$/iu },
  { key: "email", re: /^(?:email|e-mail|信箱|郵箱)[：:\s]\s*(.+)$/iu },
  { key: "budget", re: /^(?:預算|budget)[：:\s]\s*(.+)$/iu },
  { key: "customer_need", re: /^(?:需求|客戶需求|customer\s*need)[：:\s]\s*(.+)$/iu },
];

export function extractLabeledCrmFields(lines: string[]): LabeledCrmFields {
  const out: LabeledCrmFields = {
    customer_name: "",
    company_name: "",
    phone: "",
    line_id: "",
    email: "",
    budget: "",
    customer_need: "",
  };

  for (const line of lines) {
    for (const { key, re } of LABELED_FIELD_PATTERNS) {
      if (out[key]) continue;
      const m = line.match(re);
      if (!m?.[1]) continue;
      const value = m[1].trim().replace(/^[「『"'（(]+|[」』"'）)]+$/gu, "");
      if (!value) continue;
      if (key === "customer_name") {
        const name = sanitizeCustomerNameValue(value);
        if (name) out[key] = name;
      } else if (key === "line_id") {
        const lid = normalizeLineIdForDisplay(value);
        if (lid) out[key] = lid;
      } else {
        out[key] = value;
      }
    }
  }

  return out;
}

/** Parse budget / estimated amount phrases from chat (預算、萬、NT$). */
export function extractBudgetFromChat(text: string, lang: string): string {
  const t = text.trim();
  if (!t) return lang === "zh" ? "" : "";

  const labeled = extractLabeledCrmFields(splitChatLines(t));
  if (labeled.budget) {
    const normalized = normalizeBudgetPhrase(labeled.budget);
    if (normalized) return normalized;
  }

  const range = t.match(/預算\s*(?:大概|約)?\s*(\d+)\s*萬\s*(?:到|至|~|～|-|—)\s*(\d+)\s*萬/u);
  if (range) return `預算${range[1]}萬-${range[2]}萬`;

  const budget = t.match(/預算\s*(?:約|大概)?\s*(\d+[\d,.]*\s*萬?)/u);
  if (budget) return `預算${budget[1].replace(/\s/g, "")}`;

  const budgetAlt = t.match(/(\d+[\d,.]*\s*萬)\s*(?:左右|以內)?\s*預算/u);
  if (budgetAlt) return `預算${budgetAlt[1].replace(/\s/g, "")}`;

  const patterns = [
    /NT\$?\s?[\d,]+/i,
    /TWD\s?[\d,]+/i,
    /台幣\s?[\d,]+/i,
    /新台幣\s?[\d,]+/i,
    /[\d,]+\s?萬/,
    /USD\s?\$?[\d,]+/i,
    /US\$[\d,]+/i,
    /\$[\d,]+/i,
    /budget\s*(?:around|about)?\s*([$\d,.\s]+(?:k|K)?)/i,
  ];

  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) return match[0].trim();
  }

  return "";
}

/** Numeric estimated amount for CRM (e.g. 預算25萬 → 250000). */
export function extractEstimatedAmountFromChat(text: string): string {
  const t = text.trim();
  if (!t) return "";

  const wanBudget = t.match(/預算\s*(?:約|大概)?\s*(\d+)\s*萬/u);
  if (wanBudget) return String(Number(wanBudget[1]) * 10000);

  const wanAlt = t.match(/(\d+)\s*萬\s*(?:左右|以內)?\s*預算/u);
  if (wanAlt) return String(Number(wanAlt[1]) * 10000);

  const nt = t.match(/(?:NT\$?|TWD|台幣|新台幣)\s*([\d,]+)/i);
  if (nt) return nt[1].replace(/,/g, "");

  const plain = t.match(/\$\s*([\d,]+)/);
  if (plain) return plain[1].replace(/,/g, "");

  return "";
}

function normalizeBudgetPhrase(raw: string): string {
  const t = raw.trim().replace(/^[：:\s]+/, "");
  if (!t) return "";
  if (/^預算/u.test(t)) return t.replace(/\s+/g, "");
  if (/\d+\s*萬/.test(t)) return `預算${t.replace(/\s+/g, "")}`;
  return t;
}

// ——— STEP 1: phone, LINE ID, email ———

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return "";

  if (digits.startsWith("+886")) {
    const rest = digits.slice(4);
    if (/^9\d{8}$/.test(rest)) return `0${rest}`;
    if (/^0\d{8,9}$/.test(rest)) return rest.startsWith("0") ? rest : `0${rest}`;
  }

  if (digits.startsWith("886") && digits.length >= 11) {
    const rest = digits.slice(3);
    if (/^9\d{8}$/.test(rest)) return `0${rest}`;
  }

  const onlyDigits = digits.replace(/\D/g, "");

  if (/^09\d{8}$/.test(onlyDigits)) return onlyDigits;

  if (/^02\d{8}$/.test(onlyDigits)) {
    return `02-${onlyDigits.slice(2)}`;
  }

  if (/^0\d{9,10}$/.test(onlyDigits)) {
    if (onlyDigits.startsWith("02") && onlyDigits.length === 10) {
      return `02-${onlyDigits.slice(2)}`;
    }
    return onlyDigits;
  }

  return "";
}

function extractPhoneStep1(text: string): string {
  const candidates: string[] = [];
  const patterns = [
    /\+886[\s\-]?9\d{2}[\s\-]?\d{3}[\s\-]?\d{3}/g,
    /09\d{2}[\s\-]?\d{3}[\s\-]?\d{3}/g,
    /09\d{8}/g,
    /02[\s\-]?\d{4}[\s\-]?\d{4}/g,
    /0\d{1,2}[\s\-]?\d{3,4}[\s\-]?\d{4}/g,
  ];

  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      const normalized = normalizePhone(m[0]);
      if (normalized) candidates.push(normalized);
    }
  }

  const mobile = candidates.find((c) => /^09\d{8}$/.test(c));
  if (mobile) return mobile;

  const landline = candidates.find((c) => /^02-\d{8}$/.test(c));
  if (landline) return landline;

  return candidates[0] ?? "";
}

function isLikelyLineId(id: string, email: string): boolean {
  const v = id.trim();
  if (v.length < 3 || v.length > 40) return false;
  if (/^\d+$/.test(v)) return false;
  if (/^09\d{8}$/.test(v.replace(/\D/g, ""))) return false;
  if (email && v.toLowerCase() === email.toLowerCase()) return false;
  if (/@/.test(v) && /\.[a-z]{2,}$/i.test(v)) return false;
  return /^@?[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/.test(v);
}

/**「ID：dr_beauty_clinic」/「LINE ID：@foo」chat export lines — speaker is a field label, content is the id. */
function extractLineIdFromFieldSpeakerLines(lines: string[], email: string): string {
  for (const line of lines) {
    const { speaker, content } = parseChatSpeakerLine(line);
    if (!speaker || !LINE_ID_FIELD_SPEAKER_RE.test(speaker.trim())) continue;
    const id = normalizeLineIdForDisplay(content);
    if (id && isLikelyLineId(id, email)) return id;
  }
  return "";
}

function extractLineIdStep1(text: string, email: string): string {
  const colon = "[\\uFF1A\\uFF1B:\\u003A]"; // fullwidth : ; and ASCII :
  const patterns = [
    new RegExp(`(?:LINE\\s*ID|LINE|line\\s*id|line)\\s*(?:${colon}|是)\\s*(@?[A-Za-z0-9._-]{2,40})`, "gi"),
    /(?:LINE|line)[\s\u3000]+(@?[A-Za-z0-9._-]{3,40})(?=\s|$|[，,。])/gi,
    /(?:LINE\s*ID|LINE|line\s*id|line)\s*(?:[：:]|是)\s*(@?[A-Za-z0-9._-]{3,40})/gi,
    /我的\s*line\s*是\s*(@?[A-Za-z0-9._-]{3,40})/gi,
    /ID\s*是\s*(@?[A-Za-z0-9._-]{3,40})/gi,
    /(?:加\s*)?我\s*的\s*LINE\s*[：:\uFF1A]\s*(@?[A-Za-z0-9._-]{3,40})/gi,
  ];

  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      const id = (m[1] ?? "").trim();
      if (isLikelyLineId(id, email)) return id;
    }
  }

  return "";
}

function extractEmailStep1(text: string): string {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].trim() : "";
}

// ——— STEP 2: company ———

type ConversationalCompanyPattern = { re: RegExp; contextual: boolean };

/** Company name token (no spaces — avoids swallowing trailing 好了 / filler). */
const COMPANY_NAME_CORE = "[\\u4e00-\\u9fffA-Za-z0-9&·・（）()\\-]";
const COMPANY_NAME_END =
  "(?=\\s*(?:好了|就可以了|就行|即可|喔|哦|噢|嗎|吗)|[」』\"'）)\\s，,。.!？?]|$)";

/** Business-type words in conversational intros (我們診所叫、健身房叫). */
const BIZ_ENTITY =
  "(?:品牌|健身房|健身中心|診所|诊所|工作室|咖啡廳|咖啡厅|餐廳|餐厅|牙醫|牙医|醫美|医美|俱樂部|俱乐部|Gym|Studio|gym|studio)";

function conversationalCompanyRe(prefix: string, contextual: boolean): ConversationalCompanyPattern {
  return {
    re: new RegExp(
      `${prefix}\\s*[「『"'（(]?(${COMPANY_NAME_CORE}{2,28})${COMPANY_NAME_END}`,
      "u",
    ),
    contextual,
  };
}

/** Longer / more specific intro phrases first. */
const CONVERSATIONAL_COMPANY_PATTERNS: ConversationalCompanyPattern[] = [
  conversationalCompanyRe("就寫", true),
  conversationalCompanyRe("可以寫", true),
  conversationalCompanyRe("(?:寫成|改為|改成)", true),
  conversationalCompanyRe("店名(?:是|叫|為|为)", true),
  conversationalCompanyRe("(?:我們|我们)診所叫", true),
  conversationalCompanyRe("(?:我們|我们)診所(?:是|為|为)", true),
  conversationalCompanyRe("診所(?:叫|是|為|为)", true),
  conversationalCompanyRe("(?:我們|我们)公司(?:是|叫|為|为)", true),
  conversationalCompanyRe("(?:我們|我们)?公司叫", true),
  conversationalCompanyRe("公司叫", true),
  conversationalCompanyRe("(?:我們|我们)店(?:名)?(?:是|叫|為|为)", true),
  conversationalCompanyRe(
    `(?:我們|我们)?${BIZ_ENTITY}\\s*(?:叫做|叫|是|為|为)`,
    true,
  ),
  conversationalCompanyRe("(?:我們|我们)是", false),
];

function acceptCompanyCandidate(raw: string, contextual: boolean): string {
  const normalized = cleanCompanyCandidate(raw);
  if (isValidNaturalCompanyName(normalized, { fromContextualPattern: contextual })) {
    return normalized;
  }
  if (isValidCompanyName(normalized)) {
    return normalized;
  }
  return "";
}

function extractConversationalCompany(text: string): string {
  const t = text.trim();
  if (!t) return "";

  let best = "";
  for (const { re, contextual } of CONVERSATIONAL_COMPANY_PATTERNS) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const reAll = new RegExp(re.source, flags);
    for (const m of t.matchAll(reAll)) {
      if (!m[1]) continue;
      const accepted = acceptCompanyCandidate(m[1], contextual);
      if (accepted && accepted.length > best.length) {
        best = accepted;
      }
    }
  }

  return best;
}

function extractCompanyFromLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  const conversational = extractConversationalCompany(trimmed);
  if (conversational) return conversational;

  for (const m of trimmed.matchAll(COMPANY_SUFFIX_RE)) {
    const raw = (m[1] ?? m[0] ?? "").trim();
    const accepted = acceptCompanyCandidate(raw, true);
    if (accepted) return accepted;
  }

  const labeled = trimmed.match(
    new RegExp(
      `(?:公司|店名|品牌|診所|诊所)(?:名稱|名称)?(?:[：:]|是|為|为|叫做|名为|名為|叫)\\s*[「『"'（(]?(${COMPANY_NAME_CORE}{2,28})${COMPANY_NAME_END}`,
      "u",
    ),
  );
  if (labeled?.[1]) {
    const accepted = acceptCompanyCandidate(labeled[1], true);
    if (accepted) return accepted;
  }

  return "";
}

const COMPANY_NAME_ASK_RE = /公司名稱|公司名称|公司名字/u;
const COMPANY_NAME_ASK_QUESTION_RE =
  /(?:怎麼寫|如何寫|先怎麼寫|要怎麼寫|填什麼|怎麼填|如何填|要填|怎麼填寫|先.*寫)/u;
const CHAT_SPEAKER_PREFIX_RE = /^(.{1,12})[：:]\s*(.+)$/u;
const BUSINESS_SIDE_SPEAKER_RE =
  /^(?:我|我方|Me|Agent|Sales|客服|業務|顾问|顧問|我们|我們|本公司|我司)$/iu;

function parseChatSpeakerLine(line: string): { speaker: string; content: string } {
  const t = line.trim();
  const m = t.match(CHAT_SPEAKER_PREFIX_RE);
  if (!m?.[2]) return { speaker: "", content: t };
  return { speaker: m[1].trim(), content: m[2].trim() };
}

function isCompanyNameAskContent(content: string): boolean {
  const t = content.trim();
  if (!t || !COMPANY_NAME_ASK_RE.test(t)) return false;
  return COMPANY_NAME_ASK_QUESTION_RE.test(t);
}

/** Q&A: seller asks how to write company name → next customer reply is company_name. */
function extractCompanyFromCompanyNameQA(lines: string[]): string {
  for (let i = 0; i < lines.length; i++) {
    const { content: question } = parseChatSpeakerLine(lines[i]);
    if (!isCompanyNameAskContent(question)) continue;

    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const { speaker, content: reply } = parseChatSpeakerLine(lines[j]);
      if (!reply || isCompanyNameAskContent(reply)) continue;
      if (speaker && BUSINESS_SIDE_SPEAKER_RE.test(speaker)) continue;
      if (/^第[一二三四五六七八九十\d]/u.test(reply)) continue;
      const accepted = acceptCompanyCandidate(reply, true);
      if (accepted) return accepted;
    }
  }
  return "";
}

function extractCompanyStep2(fullText: string, lines: string[]): string {
  const fromQA = extractCompanyFromCompanyNameQA(lines);
  if (fromQA) return fromQA;

  const companyLines = lines.filter((l) => isCompanyOnlyLine(l));
  const searchLines = companyLines.length > 0 ? companyLines : lines;

  let best = "";
  for (const line of searchLines) {
    const found = extractCompanyFromLine(line);
    if (found && found.length > best.length) {
      best = found;
    }
  }
  if (best) return best;

  const fromFullText = extractConversationalCompany(fullText);
  if (fromFullText) return fromFullText;

  for (const m of fullText.matchAll(COMPANY_SUFFIX_RE)) {
    const raw = (m[1] ?? m[0] ?? "").trim();
    const accepted = acceptCompanyCandidate(raw, true);
    if (accepted) return accepted;
  }

  return "";
}

// ——— STEP 3: customer name (allowed patterns only) ———

type NamePattern = { re: RegExp; minLen: number; maxLen: number };

const ZH_NAME_PATTERNS: NamePattern[] = [
  { re: /我姓\s*([\u4e00-\u9fff]{1,2})/u, minLen: 1, maxLen: 2 },
  { re: /我是\s*([\u4e00-\u9fff]{1,3})(先生|小姐)/u, minLen: 1, maxLen: 3 },
  { re: /我叫\s*([\u4e00-\u9fff]{2,4})/u, minLen: 2, maxLen: 4 },
  { re: /可以叫我\s*([\u4e00-\u9fff]{1,3})(先生|小姐)/u, minLen: 1, maxLen: 3 },
];

const SPEAKER_LABEL_HONORIFIC_RE =
  /^([\u4e00-\u9fff]{1,3})(先生|小姐|經理|经理)$/u;
const SPEAKER_LABEL_EN_TITLED_RE =
  /^(Dr\.|Mr\.|Ms\.|Mrs\.)\s+([A-Za-z][A-Za-z.'-]{1,29})$/i;
const SPEAKER_LABEL_EN_RE = /^[A-Za-z][A-Za-z.'-]{1,29}$/;

const EN_NAME_PATTERNS: NamePattern[] = [
  { re: /我是\s*([A-Za-z]{2,30})(?![A-Za-z])/u, minLen: 2, maxLen: 30 },
  { re: /我叫\s*([A-Za-z]{2,30})(?![A-Za-z])/u, minLen: 2, maxLen: 30 },
  { re: /(?:^|\s)(?:I'm|I am|my name is|call me)\s+([A-Za-z][A-Za-z.'-]{1,29})(?:\s|[,.!?]|$)/i, minLen: 2, maxLen: 30 },
];

function stripSpeakerPrefix(line: string): string {
  return line.replace(/^(?:客戶|對方|client|customer)[：:\s]+/i, "").trim();
}

function splitNameClauses(line: string): string[] {
  return line
    .split(/[，,、；;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatChineseNameMatch(base: string, honorific?: string): string {
  const name = base.trim();
  const suffix = honorific?.trim() ?? "";
  if (!suffix) return name;
  return `${name}${suffix}`;
}

function isBusinessDescriptionFragment(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/我們是|我们是|是做|做.{0,12}(?:品牌|公司|產品|产品|生意)/u.test(t)) return true;
  if (/品牌$|公司$|有限公司|股份有限公司|工作室/u.test(t) && !SELF_INTRO_NAME_RE.test(t)) return true;
  return false;
}

function tryNamePatternsOnLine(line: string, lang: string): string {
  const trimmed = stripSpeakerPrefix(line.trim());
  if (!trimmed) return "";

  const segments = [trimmed, ...splitNameClauses(trimmed)];
  const patterns = lang === "zh" ? [...ZH_NAME_PATTERNS, ...EN_NAME_PATTERNS] : EN_NAME_PATTERNS;

  for (const segment of segments) {
    if (isBusinessDescriptionFragment(segment)) continue;

    for (const { re, minLen, maxLen } of patterns) {
      const m = segment.match(re);
      if (!m?.[1]) continue;

      const honorific = typeof m[2] === "string" && /^(先生|小姐)$/.test(m[2]) ? m[2] : "";
      const candidate = formatChineseNameMatch(m[1], honorific);
      if (candidate.length < minLen || candidate.length > maxLen + honorific.length) continue;
      if (!isValidExtractedCustomerName(candidate)) continue;

      console.log("NAME_EXTRACTION_DEBUG", {
        line: segment,
        matchedName: candidate,
      });
      return candidate;
    }
  }

  return "";
}

function formatSpeakerLabelName(speaker: string): string {
  const t = speaker.trim();
  const zh = t.match(SPEAKER_LABEL_HONORIFIC_RE);
  if (zh?.[1] && zh[2]) return formatChineseNameMatch(zh[1], zh[2]);
  const titled = t.match(SPEAKER_LABEL_EN_TITLED_RE);
  if (titled) return `${titled[1]} ${titled[2]}`.trim();
  return t;
}

function isPlausibleChatSpeakerLabel(speaker: string): boolean {
  const t = speaker.trim();
  if (!t || t.length > 12) return false;
  if (BUSINESS_SIDE_SPEAKER_RE.test(t)) return false;
  if (LINE_ID_FIELD_SPEAKER_RE.test(t)) return false;
  if (/^(?:客戶|客户|customer|client|對方|对方)$/iu.test(t)) return false;
  if (/[0-9@#]|[：:].*[：:]/u.test(t)) return false;
  if (isRejectedChineseNameToken(t)) return false;
  if (SPEAKER_LABEL_HONORIFIC_RE.test(t)) return true;
  if (SPEAKER_LABEL_EN_TITLED_RE.test(t)) return true;
  if (SPEAKER_LABEL_EN_RE.test(t)) return true;
  const formatted = formatSpeakerLabelName(t);
  return isValidExtractedCustomerName(formatted);
}

/** Prefer「王小姐：」style speaker labels before colon. */
function extractNameFromSpeakerLabels(lines: string[]): string {
  for (const line of lines) {
    const { speaker } = parseChatSpeakerLine(line);
    if (!speaker || !isPlausibleChatSpeakerLabel(speaker)) continue;
    const candidate = formatSpeakerLabelName(speaker);
    if (!isValidExtractedCustomerName(candidate)) continue;
    console.log("NAME_EXTRACTION_DEBUG", {
      line,
      matchedName: candidate,
      source: "speaker-label-colon",
    });
    return candidate;
  }
  return "";
}

/** Deterministic honorific name (王先生 / 陳小姐 / 張經理) — runs before AI and self-intro patterns. */
export function extractHonorificCustomerName(text: string): string {
  const fullText = text.trim();
  if (!fullText) return "";

  const candidates = [...splitChatLines(text), fullText];
  for (const rawLine of candidates) {
    const line = stripSpeakerPrefix(rawLine.trim());
    if (!line) continue;

    for (const segment of [line, ...splitNameClauses(line)]) {
      const m1 = segment.match(HONORIFIC_NAME_LINE_RE);
      if (m1?.[1] && m1[2]) {
        const candidate = formatChineseNameMatch(m1[1], m1[2]);
        if (isValidExtractedCustomerName(candidate)) {
          console.log("NAME_EXTRACTION_DEBUG", {
            line: segment,
            matchedName: candidate,
            source: "honorific-line-start",
          });
          return candidate;
        }
      }

      const m2 = segment.match(HONORIFIC_NAME_INLINE_RE);
      if (m2?.[1] && m2[2]) {
        const candidate = formatChineseNameMatch(m2[1], m2[2]);
        if (isValidExtractedCustomerName(candidate)) {
          console.log("NAME_EXTRACTION_DEBUG", {
            line: segment,
            matchedName: candidate,
            source: "honorific-inline",
          });
          return candidate;
        }
      }
    }
  }

  return "";
}

function extractCustomerNameStep3(fullText: string, lines: string[], lang: string): string {
  const fromSpeaker = extractNameFromSpeakerLabels(lines);
  if (fromSpeaker) return fromSpeaker;

  const honorific = extractHonorificCustomerName(fullText);
  if (honorific) return honorific;

  for (const line of lines) {
    const name = tryNamePatternsOnLine(line, lang);
    if (name) return name;
  }

  const name = tryNamePatternsOnLine(fullText, lang);
  if (name) return name;

  return "";
}

// ——— Customer need & note (conversation-aware) ———

const BUSINESS_SPEAKER_PREFIX_RE =
  /^(?:我|我方|我們|我们|本公司|我司|業務|客服|銷售|顾问|顧問|sales|support|team|agent|me)[：:]/i;
const CUSTOMER_SPEAKER_PREFIX_RE = /^(?:客戶|客户|customer|client|對方|对方)[：:]/i;

const BUSINESS_CONTENT_RE =
  /我們有|我們提供|本公司|我司|我這邊|我這邊有|這邊有|white studio|green screen|綠幕|白棚|燈光攝影師|can also provide|we have|we offer|our studio/i;

const CUSTOMER_NEED_CONTENT_RE =
  /想拍|想租|想了解|需要|希望|打算|預算|報價|价格|價格|拍攝|影片|视频|形象|產品|产品|品牌|studio|shoot|video|budget|quotation|quote|病患|病歷|病人|術後|追蹤提醒|預約|回診|分類需求|高單價|手機版|分店|CRM|診所|醫美|整合|提醒系統/i;

const CUSTOMER_NOTE_CONTENT_RE =
  /備註|特殊|另外|對了|对了|改時間|改期|urgent|deadline/i;

function isBusinessSideLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (BUSINESS_SPEAKER_PREFIX_RE.test(t)) return true;
  if (/^(?:Me|Agent|Sales)[：:]/i.test(t)) return true;
  if (BUSINESS_CONTENT_RE.test(t)) return true;
  return false;
}

function isCustomerSideLine(line: string): boolean {
  const t = line.trim();
  if (CUSTOMER_SPEAKER_PREFIX_RE.test(t)) return true;
  if (isBusinessSideLine(t)) return false;
  return !BUSINESS_CONTENT_RE.test(t);
}

function stripConversationSpeakerLabel(line: string): string {
  return line
    .replace(/^(?:客戶|客户|Customer|Client|對方|对方)[：:\s]+/i, "")
    .replace(/^(?:Me|Agent|Sales|Support|Team)[：:\s]+/i, "")
    .replace(/^(?:我方|我們|我们|本公司|我司)[：:\s]+/i, "")
    .trim();
}

function isIdentityOrContactLine(content: string, profile: ExtractedCustomerProfile): boolean {
  const t = content.trim();
  if (!t || t.length < 2) return true;
  if (isCompanyOnlyLine(t) && !CUSTOMER_NEED_CONTENT_RE.test(t)) return true;
  if (/^[\d\s\-:+().]+$/.test(t)) return true;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t)) return true;
  if (/09\d{8}/.test(t.replace(/\D/g, ""))) return true;
  if (/(?:LINE\s*ID|line\s*id|電話|手機|phone|tel)/i.test(t) && t.length < 48) return true;
  if (/^我姓[\u4e00-\u9fff]{1,2}/u.test(t)) return true;
  if (/^(?:我叫|我是)/u.test(t) && !CUSTOMER_NEED_CONTENT_RE.test(t)) return true;
  if (profile.customer_name && t.includes(profile.customer_name)) return true;
  if (profile.company_name && t.includes(profile.company_name)) return true;
  if (profile.phone && t.replace(/\D/g, "").includes(profile.phone.replace(/\D/g, ""))) return true;
  if (profile.line_id && t.toLowerCase().includes(profile.line_id.toLowerCase())) return true;
  if (profile.email && t.toLowerCase().includes(profile.email.toLowerCase())) return true;
  if (GREETING_NAME_TOKENS.has(t.replace(/[！!。.,，\s]/g, ""))) return true;
  return false;
}

function redactProfileFromSnippet(text: string, profile: ExtractedCustomerProfile): string {
  let s = text;
  const replacements = [
    profile.customer_name,
    profile.company_name,
    profile.phone,
    profile.line_id,
    profile.email,
  ].filter(Boolean) as string[];

  for (const token of replacements) {
    s = s.split(token).join(" ");
  }

  s = s
    .replace(/09\d{2}[\s\-]?\d{3}[\s\-]?\d{3}/g, " ")
    .replace(/09\d{8}/g, " ")
    .replace(/(?:LINE\s*ID|line\s*id|line)[：:\s]*\S+/gi, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
    .replace(/^(?:客戶|客户|Customer|Client|Me|Agent|Sales)[：:\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return s;
}

function isPrimaryNeedFragment(content: string): boolean {
  return CUSTOMER_NEED_CONTENT_RE.test(content);
}

function isSubstantiveNeedContent(content: string): boolean {
  return /想拍|想租|需要拍|希望拍|打算拍|風格|风格|高級感|高级感|質感|科技感|形象影片|產品形象|品牌影片|宣傳片|短片|秒|分鐘|分钟|IG|官網|官网|Facebook|\bFB\b|小紅書|抖音|YouTube|LED|棚拍|攝影棚|模特|麻豆|妝髮|妆发|化妝|化妆|預算|報價|报价|拍攝|租用|交付|檔期|档期|月底前|完成|萬|want to shoot|shooting style|duration|budget|makeup|model|病患|病歷|術後|追蹤|預約|回診|分類|高單價|手機版|分店|CRM|醫美|整合/i.test(
    content,
  );
}

const GENERIC_AI_NEED_RE =
  /依對話內容整理|Summarize needs and timeline from the conversation/i;

export function isGenericCustomerNeedPhrase(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  return GENERIC_AI_NEED_RE.test(t);
}

const CRM_SAAS_NEED_RULES: { re: RegExp; chip: string }[] = [
  { re: /病患資料整合?|病歷整合?|病人資料整合?/, chip: "病患資料整合" },
  { re: /術後追蹤提醒?|術後追蹤/, chip: "術後追蹤提醒" },
  { re: /預約與回診通知?|預約.*回診|回診通知/, chip: "預約與回診通知" },
  { re: /AI\s*分類.*需求|AI.*客戶需求|智能分類.*需求/, chip: "AI 分類客戶需求" },
  { re: /高單價客戶標記?|高單價.*標記/, chip: "高單價客戶標記" },
  { re: /手機版|行動版|mobile\s*app/i, chip: "手機版" },
  { re: /分店管理/, chip: "分店管理" },
];

/** Requirement chips for insight cards (next step / todo / reply), not raw chat lines. */
export function listCustomerNeedChipsForInsights(
  customerNeed: string,
  lineText: string,
  lang: AppLang,
): string[] {
  const sep = lang === "zh" ? "、" : ", ";
  const chips: string[] = [];

  for (const part of customerNeed.split(sep)) {
    const p = part.trim();
    if (!p || isGenericCustomerNeedPhrase(p)) continue;
    pushUniqueNeedChip(chips, p);
  }

  for (const chip of extractCrmSaasRequirementChips(lineText)) {
    pushUniqueNeedChip(chips, chip);
  }

  return chips.filter((c) => !looksLikeVerboseChatNeed(c) && c.length >= 2);
}

function extractCrmSaasRequirementChips(text: string): string[] {
  const chips: string[] = [];
  const t = stripIntroNoiseForNeedMining(text);
  if (!t) return chips;

  for (const { re, chip } of CRM_SAAS_NEED_RULES) {
    if (re.test(t)) pushUniqueNeedChip(chips, chip);
  }

  for (const m of t.matchAll(
    /(?:第[一二三四五六七八九十\d]+个?|[\d]+)[、.．)\s]+(?:是|為|为)?\s*([^，。；\n]{2,28})/gu,
  )) {
    const clause = (m[1] ?? "").trim();
    if (!clause || clause.length < 2) continue;
    for (const { re, chip } of CRM_SAAS_NEED_RULES) {
      if (re.test(clause)) {
        pushUniqueNeedChip(chips, chip);
        break;
      }
    }
    if (
      /病患|病歷|術後|追蹤|預約|回診|分類|高單價|手機|分店|CRM|整合|醫美|診所/i.test(clause) &&
      !/公司名稱|怎麼寫/u.test(clause)
    ) {
      pushUniqueNeedChip(chips, clause.replace(/^(?:是|為|为)\s*/u, ""));
    }
  }

  return filterValidNeedChips(chips);
}

function isCompactNeedSummary(value: string, lang: string): boolean {
  const separator = lang === "zh" ? "、" : ", ";
  if (!value.includes(separator)) return false;
  const parts = value
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every(
    (part) =>
      part.length > 0 &&
      part.length <= 28 &&
      !looksLikeVerboseChatNeed(part) &&
      !isIntroOnlyNeedClause(part),
  );
}

function isNoteFragment(content: string): boolean {
  return CUSTOMER_NOTE_CONTENT_RE.test(content);
}

const NEED_INTRO_NOISE_RE: RegExp[] = [
  /^(?:客戶|客户|Customer|Client|我|Me)[：:\s]*/gi,
  /客戶?\s*(?:你好|您好)/gu,
  /(?:^|[，,、\s])(?:你好|您好|哈囉|哈嘍|嗨|早安|午安|晚安)(?=[，,、\s]|$)/gu,
  /我姓[\u4e00-\u9fff]{1,2}/gu,
  /(?:我叫|我是)[\u4e00-\u9fff]{1,4}(?:先生|小姐)?/gu,
  /我們(?:公司)?(?:叫|是)[^，。；]{4,48}(?:股份有限公司|有限公司|工作室|品牌)?/gu,
  /我們是做[^，。；]{2,40}(?:的品牌|的公司|品牌)/gu,
  /我们是做[^，。；]{2,40}(?:的品牌|的公司|品牌)/gu,
  /公司名稱[：:\s]*[^，。；]{2,40}/gu,
  /(?:電話|手機|phone|tel)[：:\s]*[\d\s\-+()]{8,}/gi,
  /(?:LINE\s*ID|line\s*id|line)[：:\s]*\S+/gi,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /09\d{2}[\s\-]?\d{3}[\s\-]?\d{3}/g,
  /^目前\s*|^現在\s*|^今天\s*/gu,
  /(?:主要會|主要会|會放在|会放在|放在)/gu,
  /(?:需要請|需要请|請|请)(?=模特|麻豆)/gu,
  /(?:希望可以|希望)(?=[，,、\s])/gu,
  /一下|左右|大概|約/gu,
];

const NEED_INTRO_CHIP_RE =
  /客戶?\s*你好|我姓[\u4e00-\u9fff]{1,2}|我們是做|我们是做|我們公司叫|我们公司叫|公司名稱|^(?:你好|您好)[，,、]?/u;

function stripIntroNoiseForNeedMining(text: string): string {
  let s = text;
  for (const re of NEED_INTRO_NOISE_RE) {
    s = s.replace(re, " ");
  }
  return s.replace(/[，,、]{2,}/g, "，").replace(/\s+/g, " ").trim();
}

function splitNeedClauses(line: string): string[] {
  return line
    .split(/[，,、；;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isIntroOnlyNeedClause(content: string): boolean {
  const t = content.trim();
  if (!t) return true;
  if (NEED_INTRO_CHIP_RE.test(t) && !isSubstantiveNeedContent(t)) return true;
  if (/^(?:你好|您好|哈囉|嗨)[，,、\s]*$/u.test(t)) return true;
  if (/^我姓[\u4e00-\u9fff]{1,2}[，,、\s]*$/u.test(t)) return true;
  if (/^我們是做.+品牌$/u.test(t) || /^我们是做.+品牌$/u.test(t)) return true;
  return false;
}

function filterValidNeedChips(chips: string[]): string[] {
  return chips.filter((chip) => {
    const c = chip.trim();
    if (!c || c.length > 36) return false;
    if (/^預算\d|^\d+\s*萬\s*預算/u.test(c)) return false;
    if (NEED_INTRO_CHIP_RE.test(c) && !/(想拍|風格|秒|分鐘|IG|LED|模特|妝髮|預算|月底前|完成)/u.test(c)) {
      return false;
    }
    if (/我們是做|公司是|公司叫|客戶你好/u.test(c)) return false;
    return true;
  });
}

function looksLikeVerboseChatNeed(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (t.length < 28 && !/[，,].*[，,]/.test(t)) return false;
  return /客戶?\s*你好|我姓[\u4e00-\u9fff]{1,2}|我們是做|我们公司|我們公司叫/u.test(t);
}

function pushUniqueNeedChip(chips: string[], chip: string): void {
  const c = chip.trim().replace(/^[，,、\s]+|[，,、\s]+$/gu, "");
  if (!c || c.length > 40) return;
  const dup = chips.find((existing) => existing === c || existing.includes(c) || c.includes(existing));
  if (dup) {
    if (c.length > dup.length) {
      const idx = chips.indexOf(dup);
      chips[idx] = c;
    }
    return;
  }
  chips.push(c);
}

function extractZhRequirementChips(text: string): string[] {
  const chips: string[] = [];
  const t = stripIntroNoiseForNeedMining(text);
  if (!t) return chips;

  for (const chip of extractCrmSaasRequirementChips(t)) {
    pushUniqueNeedChip(chips, chip);
  }

  const mentionsPhotography =
    /拍攝|拍片|攝影|摄影|租棚|棚拍|模特|麻豆|妝髮|妆发|想拍|形象片|品牌影片/i.test(t);

  if (
    mentionsPhotography &&
    /保健食品/.test(t) &&
    /(?:產品)?形象影片|產品影片/.test(t)
  ) {
    pushUniqueNeedChip(chips, "保健食品產品形象影片");
  } else if (mentionsPhotography) {
    const shoot = t.match(
      /想拍(?:一支|一個|一段)?\s*([\u4e00-\u9fffA-Za-z0-9]{0,16}?(?:的)?(?:產品)?(?:形象|品牌)?影片|宣傳片|短片|廣告片)/u,
    );
    if (shoot) {
      const subject = shoot[0]
        .replace(/^想拍(?:一支|一個|一段)?\s*/u, "")
        .replace(/^[的之]/u, "")
        .trim();
      if (subject.length >= 4 && subject.length <= 20) pushUniqueNeedChip(chips, subject);
    }
  }

  if (mentionsPhotography) {
    const genericProduct = t.match(
      /(?:拍攝|製作)\s*([\u4e00-\u9fff]{2,10}?)(?:的)?(?:產品)?(?:形象|品牌)?影片/u,
    );
    if (genericProduct?.[1] && !chips.some((c) => c.includes("影片"))) {
      pushUniqueNeedChip(chips, `${genericProduct[1]}產品形象影片`);
    }
  }

  if (mentionsPhotography && /高級感|高级感|premium|高質感|高质感|偏高一|偏高一點|偏高级|高级一点/u.test(t)) {
    pushUniqueNeedChip(chips, "高級感風格");
  }
  if (/簡約|极简|minimal/i.test(t)) pushUniqueNeedChip(chips, "簡約風格");
  if (/時尚|时尚|fashion/i.test(t)) pushUniqueNeedChip(chips, "時尚風格");
  if (/質感|质感/i.test(t) && !chips.includes("高級感風格")) {
    pushUniqueNeedChip(chips, "質感風格");
  }

  const durRange = t.match(/(\d+)\s*秒\s*(?:到|至|~|～|-|—)\s*(\d+)\s*分鐘/u);
  if (durRange) pushUniqueNeedChip(chips, `${durRange[1]}秒至${durRange[2]}分鐘`);
  else {
    const secMin = t.match(/(\d+)\s*秒\s*(?:到|至)\s*(\d+)\s*分鐘/u);
    if (secMin) pushUniqueNeedChip(chips, `${secMin[1]}秒至${secMin[2]}分鐘`);
    const secOnly = t.match(/(\d+)\s*秒/u);
    const minOnly = t.match(/(\d+)\s*分鐘/u);
    if (secOnly && minOnly && !durRange) {
      pushUniqueNeedChip(chips, `${secOnly[1]}秒至${minOnly[1]}分鐘`);
    } else if (secOnly) {
      pushUniqueNeedChip(chips, `${secOnly[1]}秒`);
    } else if (minOnly) {
      pushUniqueNeedChip(chips, `${minOnly[1]}分鐘`);
    }
  }

  const platforms: string[] = [];
  if (/\bIG\b|Instagram|insta/i.test(t)) platforms.push("IG");
  if (/官網|官网|website/i.test(t)) platforms.push("官網");
  if (/Facebook|\bFB\b/i.test(t)) platforms.push("Facebook");
  if (/小紅書|小红书/i.test(t)) platforms.push("小紅書");
  if (/YouTube|油管/i.test(t)) platforms.push("YouTube");
  if (/抖音|TikTok/i.test(t)) platforms.push("抖音");
  if (platforms.length > 0) pushUniqueNeedChip(chips, `${platforms.join("與")}使用`);

  if (mentionsPhotography) {
    if (/LED/.test(t) && /(?:棚|背景|拍)/.test(t)) {
      pushUniqueNeedChip(chips, /科技感/.test(t) ? "LED科技感背景" : "LED棚拍");
    } else if (/科技感背景/.test(t)) {
      pushUniqueNeedChip(chips, "科技感背景");
    } else if (/攝影棚|棚拍|studio shoot/i.test(t)) {
      pushUniqueNeedChip(chips, "攝影棚拍攝");
    }
  }

  const hasModel = mentionsPhotography && /模特|麻豆|\bmodel\b/i.test(t);
  const hasMakeup = /妝髮|妆发|化妝|化妆|造型师|makeup/i.test(t);
  const femaleModel = /女生|女性|女模|女模特/i.test(t);
  const maleModel = /男生|男性|男模|男模特/i.test(t);
  if (hasModel && hasMakeup) {
    if (femaleModel) pushUniqueNeedChip(chips, "需女生模特兒與妝髮");
    else if (maleModel) pushUniqueNeedChip(chips, "需男生模特兒與妝髮");
    else pushUniqueNeedChip(chips, "需模特兒與妝髮");
  } else if (hasModel) {
    if (femaleModel) pushUniqueNeedChip(chips, "需女生模特兒");
    else if (maleModel) pushUniqueNeedChip(chips, "需男生模特兒");
    else pushUniqueNeedChip(chips, "需模特兒");
  } else if (hasMakeup) {
    pushUniqueNeedChip(chips, "需妝髮");
  }

  const budgetRange = t.match(/預算\s*(?:大概|約)?\s*(\d+)\s*萬\s*(?:到|至)\s*(\d+)\s*萬/u);
  if (budgetRange) {
    pushUniqueNeedChip(chips, `預算${budgetRange[1]}萬到${budgetRange[2]}萬`);
  } else {
    const budget = t.match(/預算\s*(?:約|大概)?\s*(\d+[\d,.]*\s*萬?)/u);
    if (budget) pushUniqueNeedChip(chips, `預算${budget[1].replace(/\s/g, "")}`);
    else {
      const budgetAlt = t.match(/(\d+[\d,.]*\s*萬)\s*(?:左右|以內)?\s*預算/u);
      if (budgetAlt) pushUniqueNeedChip(chips, `預算${budgetAlt[1].replace(/\s/g, "")}`);
    }
  }

  const monthDeadline = t.match(/([一二三四五六七八九十兩\d]{1,3})月底前(?:完成|交付|交片)?/u);
  if (monthDeadline) {
    pushUniqueNeedChip(chips, `${monthDeadline[1]}月底前完成`);
  } else if (/下週|下周/.test(t)) {
    pushUniqueNeedChip(chips, "下週交付");
  } else if (/兩週|两周|14\s*天/.test(t)) {
    pushUniqueNeedChip(chips, "兩週內交付");
  } else if (/盡快|尽快|急件|urgent/i.test(t)) {
    pushUniqueNeedChip(chips, "盡快交付");
  }

  return filterValidNeedChips(chips);
}

function extractEnRequirementChips(text: string): string[] {
  const chips: string[] = [];
  const t = stripIntroNoiseForNeedMining(text);
  if (!t) return chips;

  const shoot = t.match(
    /(?:want to|would like to|need to|looking to)\s+(?:shoot|film|create)\s+(.{4,40}?)(?:\.|,|$)/i,
  );
  if (shoot?.[1]) pushUniqueNeedChip(chips, shoot[1].trim());

  if (/premium|high[- ]end|luxury/i.test(t)) pushUniqueNeedChip(chips, "Premium style");
  if (/cinematic/i.test(t)) pushUniqueNeedChip(chips, "Cinematic style");

  const dur = t.match(/(\d+)\s*(?:sec(?:ond)?s?)\s*(?:to|-)\s*(\d+)\s*(?:min(?:ute)?s?)/i);
  if (dur) pushUniqueNeedChip(chips, `${dur[1]}s to ${dur[2]} min`);

  const platforms: string[] = [];
  if (/\bIG\b|Instagram/i.test(t)) platforms.push("IG");
  if (/website/i.test(t)) platforms.push("website");
  if (platforms.length) pushUniqueNeedChip(chips, `${platforms.join(" & ")} usage`);

  if (/LED/i.test(t)) pushUniqueNeedChip(chips, "LED studio background");
  if (/model/i.test(t) && /makeup/i.test(t)) pushUniqueNeedChip(chips, "Model & makeup");
  else if (/model/i.test(t)) pushUniqueNeedChip(chips, "Model needed");

  const budget = t.match(/budget\s*(?:around|about)?\s*([$\d,.\s]+(?:k|K)?)/i);
  if (budget) pushUniqueNeedChip(chips, `Budget ${budget[1].trim()}`);

  if (/asap|urgent|soon/i.test(t)) pushUniqueNeedChip(chips, "Fast delivery");

  return filterValidNeedChips(chips);
}

export function summarizeCustomerNeed(text: string, lang: string): string {
  const mined = text.trim();
  if (!mined) return "";
  const chips = lang === "zh" ? extractZhRequirementChips(mined) : extractEnRequirementChips(mined);
  const valid = filterValidNeedChips(chips);
  if (valid.length === 0) return "";
  const summary = valid.join(lang === "zh" ? "、" : ", ");
  if (looksLikeVerboseChatNeed(summary)) return "";
  return summary;
}

function mergeNeedChipsFromClause(clause: string, lang: string, chips: string[]): void {
  const content = stripIntroNoiseForNeedMining(clause);
  if (!content || content.length < 3) return;
  if (isIntroOnlyNeedClause(content)) return;
  if (!isSubstantiveNeedContent(content)) return;

  const summary = summarizeCustomerNeed(content, lang);
  if (!summary) return;

  const separator = lang === "zh" ? "、" : ", ";
  for (const chip of summary.split(separator)) {
    pushUniqueNeedChip(chips, chip);
  }
}

function buildCustomerNeed(lines: string[], lang: string, profile: ExtractedCustomerProfile): string {
  const chips: string[] = [];

  for (const raw of lines) {
    if (isBusinessSideLine(raw)) continue;
    if (!isCustomerSideLine(raw) && !CUSTOMER_SPEAKER_PREFIX_RE.test(raw.trim())) {
      if (isBusinessSideLine(raw) || BUSINESS_CONTENT_RE.test(raw)) continue;
    }

    const lineContent = redactProfileFromSnippet(stripConversationSpeakerLabel(raw), profile);
    const clauses = splitNeedClauses(lineContent);
    const parts = clauses.length > 0 ? clauses : [lineContent];

    for (const clause of parts) {
      if (isIdentityOrContactLine(clause, profile) && !isSubstantiveNeedContent(clause)) continue;
      if (isNoteFragment(clause) && !isSubstantiveNeedContent(clause)) continue;
      mergeNeedChipsFromClause(clause, lang, chips);
    }
  }

  const valid = filterValidNeedChips(chips);
  if (valid.length === 0) return "";
  const summary = valid.join(lang === "zh" ? "、" : ", ");
  if (looksLikeVerboseChatNeed(summary)) return "";
  return summary;
}

function buildCustomerNote(lines: string[], lang: string, profile: ExtractedCustomerProfile): string {
  const fragments: string[] = [];

  for (const raw of lines) {
    if (isBusinessSideLine(raw)) continue;

    const content = redactProfileFromSnippet(stripConversationSpeakerLabel(raw), profile);
    if (!content || content.length < 3) continue;
    if (isIdentityOrContactLine(content, profile)) continue;
    if (isSubstantiveNeedContent(content) || extractCrmSaasRequirementChips(content).length > 0) {
      continue;
    }
    if (isPrimaryNeedFragment(content) && !isNoteFragment(content)) continue;

    if (isNoteFragment(content)) {
      fragments.push(content);
    }
  }

  return fragments.slice(0, 3).join(lang === "zh" ? "；" : "; ").trim();
}

/** Strip labels, contact info, and business replies; output requirement chips only. */
export function cleanCustomerNeedText(
  value: string,
  profile: ExtractedCustomerProfile,
  lang: string,
): string {
  const raw = value.trim();
  if (!raw) return "";
  if (isGenericCustomerNeedPhrase(raw)) return "";
  if (looksLikeVerboseChatNeed(raw) && !isSubstantiveNeedContent(raw)) return "";

  if (isCompactNeedSummary(raw, lang)) {
    const separator = lang === "zh" ? "、" : ", ";
    const valid = filterValidNeedChips(
      raw
        .split(separator)
        .map((part) => part.trim())
        .filter((part) => part && isSubstantiveNeedContent(part)),
    );
    if (valid.length > 0) return valid.join(separator);
  }

  const lines = splitChatLines(raw.replace(/[；;]/g, "\n"));
  const fromLines = buildCustomerNeed(lines.length > 1 ? lines : [raw], lang, profile);
  if (fromLines && !looksLikeVerboseChatNeed(fromLines)) return fromLines;

  const mined = stripIntroNoiseForNeedMining(
    redactProfileFromSnippet(stripConversationSpeakerLabel(raw), profile),
  );
  if (!mined || isBusinessSideLine(mined)) return "";
  if (isIntroOnlyNeedClause(mined)) return "";
  if (isIdentityOrContactLine(mined, profile) && !isSubstantiveNeedContent(mined)) return "";

  const summarized = summarizeCustomerNeed(mined, lang);
  if (summarized && !looksLikeVerboseChatNeed(summarized)) return summarized;
  return "";
}

/** Strip labels and non-remark content from note text. */
export function cleanCustomerNoteText(
  value: string,
  profile: ExtractedCustomerProfile,
  lang: string,
): string {
  const raw = value.trim();
  if (!raw) return "";

  const lines = splitChatLines(raw.replace(/[；;]/g, "\n"));
  const rebuilt = buildCustomerNote(lines.length > 1 ? lines : [raw], lang, profile);
  if (rebuilt) return rebuilt;

  const single = redactProfileFromSnippet(stripConversationSpeakerLabel(raw), profile);
  if (!single || isIdentityOrContactLine(single, profile) || isBusinessSideLine(single)) return "";
  if (!isNoteFragment(single)) return "";
  return single;
}

/** Build customer_need + note from raw chat; optional fallback need from AI/merge. */
export function refineCustomerNeedAndNote(
  rawChat: string,
  profile: ExtractedCustomerProfile,
  lang: string,
  fallbackNeed = "",
): { customer_need: string; note: string } {
  const lines = splitChatLines(rawChat);
  let customer_need = buildCustomerNeed(lines, lang, profile);
  if (!customer_need && fallbackNeed.trim()) {
    customer_need = cleanCustomerNeedText(fallbackNeed, profile, lang);
  }

  if (customer_need) {
    customer_need = cleanCustomerNeedText(customer_need, profile, lang);
  }
  console.log("CUSTOMER_NEED_SUMMARY", customer_need);

  const note = buildCustomerNote(lines, lang, profile);

  return {
    customer_need,
    note: cleanCustomerNoteText(note, profile, lang),
  };
}

// ——— Public API ———

export function sanitizeCustomerData(
  input: ExtractedCustomerProfile,
  lang: string,
): ExtractedCustomerProfile {
  const validated = validateCustomerData(input, lang);
  const data = { ...validated.data };

  if (!isValidExtractedCustomerName(data.customer_name)) {
    data.customer_name = "";
  }

  if (data.company_name) {
    data.company_name = cleanCompanyCandidate(data.company_name);
    if (
      !isValidCompanyName(data.company_name) &&
      !isValidNaturalCompanyName(data.company_name, { fromContextualPattern: true })
    ) {
      data.company_name = "";
    }
  }

  if (data.phone) {
    const p = normalizePhone(data.phone);
    data.phone = p || "";
  }

  data.customer_need = cleanCustomerNeedText(data.customer_need, data, lang);

  return data;
}

export function validateCustomerData(
  input: ExtractedCustomerProfile,
  lang: string,
): CustomerDataValidation {
  const warnings: string[] = [];
  const zh = lang === "zh";

  let customer_name = input.customer_name.trim();
  let company_name = normalizeCompanyName(input.company_name);
  let phone = input.phone.trim();
  let line_id = input.line_id.trim();
  const email = input.email.trim();
  let customer_need = input.customer_need.trim();

  if (company_name && !isValidCompanyName(company_name) && !isValidLabeledCompanyName(company_name)) {
    const rescued = extractCompanyStep2(company_name, splitChatLines(company_name));
    if (rescued) {
      company_name = rescued;
      warnings.push(zh ? "已修正公司名稱" : "Company name corrected");
    } else {
      company_name = "";
      warnings.push(zh ? "公司名稱不合法已清除" : "Invalid company name cleared");
    }
  }

  if (customer_name && !isValidExtractedCustomerName(customer_name)) {
    customer_name = "";
    warnings.push(zh ? "客戶姓名不合法已清除" : "Invalid customer name cleared");
  }

  if (phone) {
    const normalized = normalizePhone(phone);
    phone = normalized || "";
  }

  if (line_id) {
    line_id = normalizeLineIdForDisplay(line_id);
    if (line_id && !isLikelyLineId(line_id, email)) {
      line_id = "";
    }
  }

  const profileForClean: ExtractedCustomerProfile = {
    customer_name,
    company_name,
    phone,
    line_id,
    email,
    customer_need,
  };

  customer_need = cleanCustomerNeedText(customer_need, profileForClean, lang);

  return {
    data: {
      customer_name,
      company_name,
      phone,
      line_id,
      email,
      customer_need,
    },
    warnings,
  };
}

/** Forbidden substrings — if present in customer_name, field is cleared. */
export const CUSTOMER_NAME_FORBIDDEN_FRAGMENTS = [
  "公司",
  "有限公司",
  "股份有限公司",
  "工作室",
  "攝影",
  "美學",
  "我們公司",
  "叫晨光美",
  "晨光美",
] as const;

export type AiAnalyzeCustomerPayload = {
  customerName?: string;
  company?: string;
  companyName?: string;
  phone?: string;
  lineId?: string;
  email?: string;
  customerNeed?: string;
  [key: string]: unknown;
};

export type FinalMergedCustomerFields = {
  customerName: string;
  companyName: string;
  phone: string;
  lineId: string;
  email: string;
  customerNeed: string;
};

function pickMergedField(regexValue: string, aiValue: string): string {
  const fromRegex = regexValue.trim();
  if (fromRegex) return fromRegex;
  const fromAi = aiValue.trim();
  if (fromAi && !isNotProvidedLabel(fromAi)) return fromAi;
  return "";
}

function pickMergedCustomerNeed(regexValue: string, aiValue: string): string {
  const fromRegex = regexValue.trim();
  if (fromRegex) return fromRegex;
  const fromAi = aiValue.trim();
  if (fromAi && !isNotProvidedLabel(fromAi) && !isGenericCustomerNeedPhrase(fromAi)) {
    return fromAi;
  }
  return "";
}

function companyNameFromExtraction(labeled: string, inferred: string): string {
  const fromLabel = cleanCompanyCandidate(labeled);
  if (fromLabel && isValidLabeledCompanyName(fromLabel)) return fromLabel;
  const fromInferred = cleanCompanyCandidate(inferred);
  if (fromInferred && isValidNaturalCompanyName(fromInferred, { fromContextualPattern: true })) {
    return fromInferred;
  }
  if (fromInferred && isValidCompanyName(fromInferred)) return fromInferred;
  return "";
}

/** Clear customer_name if it contains forbidden business/company fragments. */
export function sanitizeCustomerNameValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || isNotProvidedLabel(trimmed)) return "";

  for (const frag of CUSTOMER_NAME_FORBIDDEN_FRAGMENTS) {
    if (trimmed.includes(frag)) return "";
  }

  if (!isValidExtractedCustomerName(trimmed)) return "";
  return trimmed;
}

/** Sanitize raw AI CRM fields before merge (never trusted over regex). */
export function sanitizeAiCustomerFields(
  ai: AiAnalyzeCustomerPayload | null | undefined,
  lang: string,
): ExtractedCustomerProfile {
  if (!ai) return { ...EMPTY };

  let company_name = normalizeCompanyName(String(ai.company ?? ai.companyName ?? ""));
  if (company_name && !isValidCompanyName(company_name)) {
    const rescued = extractCompanyStep2(company_name, splitChatLines(company_name));
    company_name = rescued || "";
  }

  const rawPhone = String(ai.phone ?? "");
  const phone = rawPhone ? normalizePhone(rawPhone) || rawPhone.trim() : "";

  let line_id = normalizeLineIdForDisplay(String(ai.lineId ?? ""));
  if (line_id && /^09\d{8}$/.test(line_id.replace(/\D/g, ""))) {
    line_id = "";
  }

  const aiProfile: ExtractedCustomerProfile = {
    customer_name: "",
    company_name,
    phone,
    line_id,
    email: String(ai.email ?? "").trim(),
    customer_need: "",
  };

  return {
    customer_name: sanitizeCustomerNameValue(String(ai.customerName ?? "")),
    company_name,
    phone,
    line_id,
    email: aiProfile.email,
    customer_need: cleanCustomerNeedText(String(ai.customerNeed ?? ""), aiProfile, lang),
  };
}

function pickConfirmedField(
  labeledValue: string,
  regexValue: string,
  aiValue: string,
): string {
  const labeled = labeledValue.trim();
  if (labeled) return labeled;
  const fromRegex = regexValue.trim();
  if (fromRegex) return fromRegex;
  const fromAi = aiValue.trim();
  if (fromAi && !isNotProvidedLabel(fromAi)) return fromAi;
  return "";
}

function pickConfirmedCustomerName(regexValue: string, aiValue: string): string {
  const fromRegex = sanitizeCustomerNameValue(regexValue);
  if (fromRegex) return fromRegex;
  return sanitizeCustomerNameValue(aiValue);
}

function pickConfirmedLineId(regexValue: string, aiValue: string, email = ""): string {
  const fromRegex = normalizeLineIdForDisplay(regexValue);
  if (fromRegex && isLikelyLineId(fromRegex, email)) return fromRegex;
  const fromAi = normalizeLineIdForDisplay(aiValue);
  if (fromAi && isLikelyLineId(fromAi, email)) return fromAi;
  return "";
}

/**
 * Confirmed CRM fields: labeled > conversational/regex > AI fallback.
 * customer_need never taken from generic AI phrases.
 */
export function mergeConfirmedCrmExtraction(
  lineText: string,
  lang: string,
  regexExtracted: ExtractedCustomerProfile,
  sanitizedAi: ExtractedCustomerProfile,
  aiExtras?: { estimatedAmount?: string },
): {
  profile: ExtractedCustomerProfile;
  note: string;
  estimatedAmount: string;
} {
  const lines = splitChatLines(lineText);
  const labeled = extractLabeledCrmFields(lines);

  let customer_name = "";
  if (labeled.customer_name && isValidExtractedCustomerName(labeled.customer_name)) {
    customer_name = labeled.customer_name;
  } else {
    customer_name = pickConfirmedCustomerName(
      regexExtracted.customer_name,
      sanitizedAi.customer_name,
    );
  }

  const company_name =
    companyNameFromExtraction(labeled.company_name, regexExtracted.company_name) ||
    pickConfirmedField("", "", sanitizedAi.company_name);

  const phone =
    (labeled.phone ? normalizePhone(labeled.phone) : "") ||
    pickConfirmedField("", regexExtracted.phone, sanitizedAi.phone);
  const line_id = pickConfirmedLineId(
    labeled.line_id || regexExtracted.line_id,
    sanitizedAi.line_id,
    regexExtracted.email || sanitizedAi.email,
  );
  const email = pickConfirmedField(labeled.email, regexExtracted.email, sanitizedAi.email);

  const aiAmount = (aiExtras?.estimatedAmount ?? "").trim();
  const estimatedAmount =
    extractEstimatedAmountFromChat(lineText) ||
    (labeled.budget ? normalizeBudgetPhrase(labeled.budget) : "") ||
    (aiAmount && !isNotProvidedLabel(aiAmount) ? aiAmount : "");

  const draftProfile: ExtractedCustomerProfile = {
    customer_name,
    company_name,
    phone,
    line_id,
    email,
    customer_need: "",
  };

  const labeledNeedFallback =
    labeled.customer_need.trim() && !isGenericCustomerNeedPhrase(labeled.customer_need)
      ? labeled.customer_need.trim()
      : "";

  const { customer_need: refinedNeed, note } = refineCustomerNeedAndNote(
    lineText,
    draftProfile,
    lang,
    labeledNeedFallback,
  );

  const profile = sanitizeCustomerData(
    { ...draftProfile, customer_need: refinedNeed },
    lang,
  );

  return {
    profile,
    note: cleanCustomerNoteText(note, profile, lang),
    estimatedAmount,
  };
}

/** Confirmed fields: labeled > regex > AI. Requires lineText for need/note refinement. */
export function mergeCustomerExtraction(
  regexExtracted: ExtractedCustomerProfile,
  sanitizedAi: ExtractedCustomerProfile,
  lineText = "",
  lang: string = "zh",
  aiExtras?: { estimatedAmount?: string },
): ExtractedCustomerProfile {
  if (lineText.trim()) {
    return mergeConfirmedCrmExtraction(lineText, lang, regexExtracted, sanitizedAi, aiExtras)
      .profile;
  }

  const merged: ExtractedCustomerProfile = {
    customer_name: pickConfirmedCustomerName(
      regexExtracted.customer_name,
      sanitizedAi.customer_name,
    ),
    company_name:
      companyNameFromExtraction("", regexExtracted.company_name) ||
      pickConfirmedField("", "", sanitizedAi.company_name),
    phone: pickConfirmedField("", regexExtracted.phone, sanitizedAi.phone),
    line_id: pickConfirmedField("", regexExtracted.line_id, sanitizedAi.line_id),
    email: pickConfirmedField("", regexExtracted.email, sanitizedAi.email),
    customer_need: pickMergedCustomerNeed(regexExtracted.customer_need, sanitizedAi.customer_need),
  };
  merged.customer_name = sanitizeCustomerNameValue(merged.customer_name);
  return merged;
}

export function toFinalMergedCustomerFields(profile: ExtractedCustomerProfile): FinalMergedCustomerFields {
  return {
    customerName: profile.customer_name,
    companyName: profile.company_name,
    phone: profile.phone,
    lineId: profile.line_id,
    email: profile.email,
    customerNeed: profile.customer_need,
  };
}

export function extractCustomerFromLineChat(raw: string, lang: string): ExtractedCustomerProfile {
  if (!raw?.trim()) return { ...EMPTY };

  const fullText = raw.trim();
  const lines = splitChatLines(raw);
  const labeled = extractLabeledCrmFields(lines);

  // STEP 1
  const email = extractEmailStep1(fullText) || labeled.email;
  const phone = extractPhoneStep1(fullText) || normalizePhone(labeled.phone);
  let line_id =
    extractLineIdFromFieldSpeakerLines(lines, email) ||
    extractLineIdStep1(fullText, email) ||
    normalizeLineIdForDisplay(labeled.line_id);
  if (line_id && !isLikelyLineId(line_id, email)) line_id = "";

  // STEP 2 — labeled 公司： wins over inferred company
  const company_name = companyNameFromExtraction(
    labeled.company_name,
    extractCompanyStep2(fullText, lines),
  );

  // STEP 3 — labeled 客戶： wins over inferred name
  let customer_name = "";
  const labeledNameRaw = labeled.customer_name.trim();
  if (labeledNameRaw && isValidExtractedCustomerName(labeledNameRaw)) {
    customer_name = labeledNameRaw;
  } else {
    customer_name = extractCustomerNameStep3(fullText, lines, lang);
    if (!isValidExtractedCustomerName(customer_name)) {
      customer_name = "";
    }
  }

  const draftProfile: ExtractedCustomerProfile = {
    customer_name,
    company_name,
    phone,
    line_id,
    email,
    customer_need: "",
  };

  const { customer_need } = refineCustomerNeedAndNote(
    raw,
    draftProfile,
    lang,
    labeled.customer_need.trim(),
  );

  const draft: ExtractedCustomerProfile = {
    ...draftProfile,
    customer_need,
  };

  const sanitized = sanitizeCustomerData(draft, lang);
  const confidence = computeConfidence(sanitized);

  logExtractionDebug({
    extractedName: sanitized.customer_name,
    extractedCompany: sanitized.company_name,
    extractedPhone: sanitized.phone,
    extractedLineId: sanitized.line_id,
    confidence,
  });

  return sanitized;
}
