/**
 * LINE chat → CRM field extraction (deterministic pipeline).
 *
 * Order: STEP 1 phone / LINE / email → STEP 2 company → STEP 3 customer name
 */

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
  /我們公司|我们公司|我公司|我司|本公司|公司名稱|公司名称|公司叫做|公司叫|我們是|我们是|本公司是|本公司叫/i;

const COMPANY_SUFFIX_RE =
  /([\u4e00-\u9fffA-Za-z0-9&·・（）()\-\s]{0,40}?(?:股份有限公司|有限公司|工作室)|[\u4e00-\u9fffA-Za-z0-9&·\s.\-]{0,40}?(?:Studio|Media|studio|media))/giu;

const COMPANY_PREFIX_STRIP_RE =
  /^(?:我們公司叫|我们公司叫|我公司叫|公司叫|我們公司|我们公司|我公司|我們是|我们是|我是|本公司叫|本公司是|本公司|我司叫|我司是|我司|這裡是|这边是|這邊是|叫)+/u;

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
  /我姓[\u4e00-\u9fff]{1,2}|我叫[\u4e00-\u9fff]{2,4}|我是[\u4e00-\u9fff]{1,3}(?:先生|小姐)|可以叫我[\u4e00-\u9fff]{1,3}(?:先生|小姐)?|(?:I'm|I am|my name is|call me)\s+[A-Za-z]/iu;

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
    n === NAME_NOT_PROVIDED_ZH ||
    lower === "not provided" ||
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

/** Strict validator — used before CRM save and after extraction. */
export function isValidExtractedCustomerName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || isNotProvidedLabel(trimmed)) return false;
  if (isGreetingName(trimmed)) return false;
  if (isBlacklistedName(trimmed)) return false;
  if (hasForbiddenNameToken(trimmed)) return false;

  const core = stripHonorifics(trimmed);
  if (!core || core.length > 8) return false;

  if (/^[\u4e00-\u9fff]+$/u.test(core)) {
    if (core.length < 1 || core.length > 4) return false;
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
  if (/^(?:我們|我们|公司叫|叫)/u.test(n)) return false;
  if (/[？?]/.test(n)) return false;
  return /(有限公司|股份有限公司|工作室|Studio|Media)/i.test(n);
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

function extractLineIdStep1(text: string, email: string): string {
  const patterns = [
    /(?:LINE\s*ID|LINE|line\s*id|line)\s*(?:[：:]|是)\s*(@?[A-Za-z0-9._-]{3,40})/gi,
    /我的\s*line\s*是\s*(@?[A-Za-z0-9._-]{3,40})/gi,
    /ID\s*是\s*(@?[A-Za-z0-9._-]{3,40})/gi,
    /(?:加\s*)?我\s*的\s*LINE\s*[：:]\s*(@?[A-Za-z0-9._-]{3,40})/gi,
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

function extractCompanyFromLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  for (const m of trimmed.matchAll(COMPANY_SUFFIX_RE)) {
    const raw = (m[1] ?? m[0] ?? "").trim();
    const normalized = normalizeCompanyName(raw);
    if (isValidCompanyName(normalized)) return normalized;
  }

  const labeled = trimmed.match(/公司(?:名稱)?[：:]\s*(.+)/u);
  if (labeled?.[1]) {
    const normalized = normalizeCompanyName(labeled[1]);
    if (isValidCompanyName(normalized)) return normalized;
  }

  return "";
}

function extractCompanyStep2(fullText: string, lines: string[]): string {
  const companyLines = lines.filter((l) => isCompanyOnlyLine(l));
  const searchLines = companyLines.length > 0 ? companyLines : lines;

  for (const line of searchLines) {
    const found = extractCompanyFromLine(line);
    if (found) return found;
  }

  for (const m of fullText.matchAll(COMPANY_SUFFIX_RE)) {
    const raw = (m[1] ?? m[0] ?? "").trim();
    const normalized = normalizeCompanyName(raw);
    if (isValidCompanyName(normalized)) return normalized;
  }

  return "";
}

// ——— STEP 3: customer name (allowed patterns only) ———

type NamePattern = { re: RegExp; minLen: number; maxLen: number };

const ZH_NAME_PATTERNS: NamePattern[] = [
  { re: /我姓\s*([\u4e00-\u9fff]{1,2})/u, minLen: 1, maxLen: 2 },
  { re: /我是\s*([\u4e00-\u9fff]{1,3})(先生|小姐)/u, minLen: 1, maxLen: 3 },
  { re: /我是\s*([\u4e00-\u9fff]{1,3})(?![\u4e00-\u9fff])/u, minLen: 1, maxLen: 3 },
  { re: /我叫\s*([\u4e00-\u9fff]{2,4})/u, minLen: 2, maxLen: 4 },
  { re: /可以叫我\s*([\u4e00-\u9fff]{1,3})(先生|小姐)?/u, minLen: 1, maxLen: 3 },
];

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

function extractCustomerNameStep3(fullText: string, lines: string[], lang: string): string {
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
  /想拍|想租|想了解|需要|希望|打算|預算|報價|价格|價格|拍攝|影片|视频|形象|產品|产品|品牌|studio|shoot|video|budget|quotation|quote/i;

const CUSTOMER_NOTE_CONTENT_RE =
  /備註|提醒|特殊|另外|對了|对了|下週|下周|改時間|改期|再聯絡|再联系|方便|盡快|尽快|urgent|follow up|schedule|deadline/i;

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
  return /想拍|想租|需要拍|希望拍|打算拍|風格|风格|高級感|高级感|質感|科技感|形象影片|產品形象|品牌影片|宣傳片|短片|秒|分鐘|分钟|IG|官網|官网|Facebook|\bFB\b|小紅書|抖音|YouTube|LED|棚拍|攝影棚|模特|麻豆|妝髮|妆发|化妝|化妆|預算|報價|报价|拍攝|租用|交付|檔期|档期|月底前|完成|萬|want to shoot|shooting style|duration|budget|makeup|model/i.test(
    content,
  );
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

  if (/保健食品/.test(t) && /(?:產品)?形象影片|產品影片/.test(t)) {
    pushUniqueNeedChip(chips, "保健食品產品形象影片");
  } else {
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

  const genericProduct = t.match(
    /(?:拍攝|製作)\s*([\u4e00-\u9fff]{2,10}?)(?:的)?(?:產品)?(?:形象|品牌)?影片/u,
  );
  if (genericProduct?.[1] && !chips.some((c) => c.includes("影片"))) {
    pushUniqueNeedChip(chips, `${genericProduct[1]}產品形象影片`);
  }

  if (/高級感|高级感|premium|高質感|高质感|偏高一|偏高一點|偏高级|高级一点/u.test(t)) {
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

  if (/LED/.test(t) && /(?:棚|背景|拍)/.test(t)) {
    pushUniqueNeedChip(chips, /科技感/.test(t) ? "LED科技感背景" : "LED棚拍");
  } else if (/科技感背景/.test(t)) {
    pushUniqueNeedChip(chips, "科技感背景");
  } else if (/攝影棚|棚拍|studio shoot/i.test(t)) {
    pushUniqueNeedChip(chips, "攝影棚拍攝");
  }

  const hasModel = /模特|麻豆|\bmodel\b/i.test(t);
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
    data.company_name = normalizeCompanyName(data.company_name);
    if (!isValidCompanyName(data.company_name)) data.company_name = "";
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

  if (company_name && !isValidCompanyName(company_name)) {
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
  if (fromAi) return fromAi;
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

  let line_id = String(ai.lineId ?? "").trim();
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

/** regexExtracted > sanitizedAI > empty */
export function mergeCustomerExtraction(
  regexExtracted: ExtractedCustomerProfile,
  sanitizedAi: ExtractedCustomerProfile,
): ExtractedCustomerProfile {
  const merged: ExtractedCustomerProfile = {
    customer_name: pickMergedField(regexExtracted.customer_name, sanitizedAi.customer_name),
    company_name: pickMergedField(regexExtracted.company_name, sanitizedAi.company_name),
    phone: pickMergedField(regexExtracted.phone, sanitizedAi.phone),
    line_id: pickMergedField(regexExtracted.line_id, sanitizedAi.line_id),
    email: pickMergedField(regexExtracted.email, sanitizedAi.email),
    customer_need: pickMergedField(regexExtracted.customer_need, sanitizedAi.customer_need),
  };

  merged.customer_name = sanitizeCustomerNameValue(merged.customer_name);
  merged.company_name = normalizeCompanyName(merged.company_name);
  if (merged.company_name && !isValidCompanyName(merged.company_name)) {
    merged.company_name = "";
  }

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

  // STEP 1
  const email = extractEmailStep1(fullText);
  const phone = extractPhoneStep1(fullText);
  const line_id = extractLineIdStep1(fullText, email);

  // STEP 2
  const company_name = extractCompanyStep2(fullText, lines);

  // STEP 3
  let customer_name = extractCustomerNameStep3(fullText, lines, lang);
  if (!isValidExtractedCustomerName(customer_name)) {
    customer_name = "";
  }

  const draftProfile: ExtractedCustomerProfile = {
    customer_name,
    company_name,
    phone,
    line_id,
    email,
    customer_need: "",
  };

  const { customer_need } = refineCustomerNeedAndNote(raw, draftProfile, lang);

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
