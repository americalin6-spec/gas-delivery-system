/**
 * Heuristic extraction from pasted LINE-style chats (no external AI API).
 * Fills CRM-oriented fields for manual review before save.
 *
 * Customer names are ONLY taken from explicit self-introduction patterns — never
 * from the first message, speaker labels, or general sentences.
 */

export type ExtractedCustomerProfile = {
  customer_name: string;
  company_name: string;
  phone: string;
  line_id: string;
  email: string;
  customer_need: string;
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

/** Business / question phrasing — never a personal name. */
const NON_NAME_PHRASE_RE =
  /[？?]|嗎|嘛|呢|吧|呀|啊|可以|能不能|是否|有沒有|有没有|多少|報價|报价|拍|影片|视频|預算|预算|下個月|下个月|請問|请问|想|需要|希望|麻煩|麻烦|你們|你们|我們|我们|有空|在嗎|在吗|負責|负责|採購|采购|合作|方案|報價|詢問|询问|聯絡|联络|方便|價格|价格|時程|时程|交期|排程|檔期|档期/;

function normalizeNameCompareToken(value: string): string {
  return value
    .replace(/[！!？?。.,，~～\s]/g, "")
    .trim()
    .toLowerCase();
}

export function isGreetingName(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;

  const compact = normalizeNameCompareToken(raw);
  if (!compact) return true;
  if (GREETING_NAME_TOKENS.has(compact)) return true;
  if (GREETING_NAME_TOKENS.has(raw)) return true;

  if (raw.length <= 6) {
    for (const g of GREETING_NAME_TOKENS) {
      if (compact === g || compact.startsWith(g)) return true;
    }
  }

  return false;
}

export function isQuestionOrSentence(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;
  if (NON_NAME_PHRASE_RE.test(raw)) return true;
  if (raw.length > 8) return true;
  return false;
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

function stripHonorifics(name: string): string {
  return name.replace(/(小姐|先生|經理|经理|主任|總監|总监)$/u, "").trim();
}

function isPlausibleChinesePersonalName(name: string): boolean {
  const n = stripHonorifics(name.trim());
  if (!n || n.length < 1 || n.length > 4) return false;
  if (!/^[\u4e00-\u9fff]+$/u.test(n)) return false;
  if (isGreetingName(n)) return false;
  if (isQuestionOrSentence(n)) return false;
  if (/(公司|有限|股份)/.test(n)) return false;
  return true;
}

function isPlausibleEnglishPersonalName(name: string): boolean {
  const n = name.trim();
  if (!n || n.length < 2 || n.length > 32) return false;
  if (!/^[A-Za-z][A-Za-z.'\-\s]{0,31}$/.test(n)) return false;
  if (isGreetingName(n)) return false;
  if (isQuestionOrSentence(n)) return false;
  return true;
}

export function isValidExtractedCustomerName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || isNotProvidedLabel(trimmed)) return false;
  if (isGreetingName(trimmed) || isQuestionOrSentence(trimmed)) return false;
  if (/^[\u4e00-\u9fff]+$/u.test(stripHonorifics(trimmed))) {
    return isPlausibleChinesePersonalName(trimmed);
  }
  return isPlausibleEnglishPersonalName(trimmed);
}

export function resolveCustomerNameForForm(raw: string, lang: string): string {
  if (!isValidExtractedCustomerName(raw)) {
    return lang === "zh" ? NAME_NOT_PROVIDED_ZH : NAME_NOT_PROVIDED_EN;
  }
  return raw.trim();
}

/** Persisted CRM value — always a string; use placeholder when no explicit name. */
export function customerNameForCrm(displayName: string, lang: string): string {
  const placeholder = lang === "zh" ? NAME_NOT_PROVIDED_ZH : NAME_NOT_PROVIDED_EN;
  const trimmed = displayName.trim();
  if (!trimmed || trimmed === placeholder || isNotProvidedLabel(trimmed)) {
    return placeholder;
  }
  if (isGreetingName(trimmed) || isQuestionOrSentence(trimmed)) {
    return placeholder;
  }
  return trimmed;
}

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

function extractEmail(text: string): string {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].trim() : "";
}

function extractPhone(text: string): string {
  const labeled =
    text.match(/(?:電話|手機|手機號碼|行動電話|Tel|Phone|Mobile)[：:\s]*([+\d][\d\s\-().]{7,}\d)/i) ||
    text.match(/(?:電話|手機|Tel|Phone)[：:\s]*([+\d][\d\s\-().]{7,})/i);
  if (labeled?.[1]) return labeled[1].replace(/\s+/g, " ").trim();

  const tw = text.match(/(?:\+886[\s\-]?)?0?9\d{8}/);
  if (tw) return tw[0].replace(/\s+/g, "");

  const intl = text.match(/\+\d{10,15}/);
  if (intl) return intl[0];

  const generic = text.match(/\b0\d{8,10}\b/);
  return generic ? generic[0] : "";
}

function extractLineId(text: string, email: string): string {
  const m1 = text.match(/LINE\s*ID[：:\s]+(@?[A-Za-z0-9._-]{3,40})/i);
  if (m1?.[1]) return m1[1].trim();

  const m2 = text.match(/(?:加\s*)?LINE[：:\s]+(@?[A-Za-z0-9._-]{3,40})/i);
  if (m2?.[1]) return m2[1].trim();

  const m3 = text.match(/\bID[：:\s]+(@?[A-Za-z0-9._-]{4,40})\b/i);
  if (m3?.[1]) {
    const id = m3[1].trim();
    if (!email || id.toLowerCase() !== email.toLowerCase()) return id;
  }

  return "";
}

function extractCompanyZh(line: string): string {
  const m = line.match(/公司(?:名稱)?[：:]\s*(.+)/);
  if (m?.[1]) return m[1].replace(/[，。,.]+$/, "").trim();

  const corp = line.match(
    /([\u4e00-\u9fff\w\s.&\-]{2,40}(?:股份有限公司|有限公司|股\s*份\s*有\s*限\s*公\s*司|有\s*限\s*公\s*司))/,
  );
  if (corp?.[1]) return corp[1].replace(/\s+/g, "").trim();

  return "";
}

function extractCompanyEn(line: string): string {
  const m = line.match(/company[：:\s]+(.+)/i);
  if (m?.[1]) return m[1].replace(/[,.]+$/, "").trim();
  const corp = line.match(/([\w\-.&\s]{3,60}(?:Inc\.?|LLC|Ltd\.?|Corp\.?|Limited))\b/i);
  return corp?.[1]?.trim() ?? "";
}

/**
 * Extract name only from explicit patterns:
 * - 我叫XXX / 我是XXX
 * - XXX先生 / XXX小姐
 * - 姓名 + 公司名（有限公司 / 股份有限公司）
 */
function extractExplicitChineseName(text: string): string {
  const sources = [text, ...splitChatLines(text)];

  for (const source of sources) {
    const line = source.trim();
    if (!line) continue;

    const woJiao = line.match(/我叫\s*([\u4e00-\u9fff]{1,4})/u);
    if (woJiao?.[1] && isPlausibleChinesePersonalName(woJiao[1])) {
      return woJiao[1].trim();
    }

    const woShi = line.match(/我是\s*([\u4e00-\u9fff]{2,4})(?![\u4e00-\u9fff])/u);
    if (woShi?.[1] && isPlausibleChinesePersonalName(woShi[1])) {
      return woShi[1].trim();
    }

    const miss = line.match(/([\u4e00-\u9fff]{1,4})小姐/u);
    if (miss?.[1] && isPlausibleChinesePersonalName(miss[1])) {
      return miss[1].trim();
    }

    const mr = line.match(/([\u4e00-\u9fff]{1,4})先生/u);
    if (mr?.[1] && isPlausibleChinesePersonalName(mr[1])) {
      return mr[1].trim();
    }

    const nameBeforeCo = line.match(
      /([\u4e00-\u9fff]{2,4})\s*[,，、／/\s]*[\u4e00-\u9fff\w.&\-]{0,24}(?:股份有限公司|有限公司|公司)/u,
    );
    if (nameBeforeCo?.[1] && isPlausibleChinesePersonalName(nameBeforeCo[1])) {
      return nameBeforeCo[1].trim();
    }

    const nameAfterCo = line.match(
      /(?:股份有限公司|有限公司|公司)\s*[,，、／/\s]*([\u4e00-\u9fff]{2,4})/u,
    );
    if (nameAfterCo?.[1] && isPlausibleChinesePersonalName(nameAfterCo[1])) {
      return nameAfterCo[1].trim();
    }
  }

  return "";
}

function extractExplicitEnglishName(text: string): string {
  const sources = [text, ...splitChatLines(text)];

  for (const source of sources) {
    const line = source.trim();
    if (!line) continue;

    const m =
      line.match(/(?:^|\s)(?:I'm|I am|my name is|call me)\s+([A-Za-z][A-Za-z.'-]{1,30})(?:\s|[,.!?]|$)/i);
    if (m?.[1] && isPlausibleEnglishPersonalName(m[1])) {
      return m[1].trim();
    }
  }

  return "";
}

function isLikelyStaffLine(line: string): boolean {
  const t = line.toLowerCase();
  return (
    /^(我方|業務|客服|銷售|顧問)/.test(line) ||
    /^(we|sales|support|team)[:\s]/i.test(line) ||
    t.includes("remix creative") ||
    t.includes("我司") ||
    t.includes("本公司")
  );
}

function stripSpeakerPrefix(line: string): string {
  return line.replace(/^(?:客戶|對方|client|customer)[：:\s]+/i, "").trim();
}

/** Summarize need from customer-side lines (never used for customer name). */
function buildCustomerNeedSnippet(lines: string[], lang: string): string {
  const body: string[] = [];
  for (const raw of lines) {
    const line = stripSpeakerPrefix(raw);
    if (!line || line.length < 4) continue;
    if (isLikelyStaffLine(line)) continue;

    const skip =
      /^[\d\s\-:+]+$/.test(line) ||
      /@/.test(line) ||
      /電話|手機|mail|email|line\s*id/i.test(line);
    if (skip && line.length < 25) continue;

    body.push(line);
    if (body.join(" ").length > 220) break;
  }

  let snippet = body.slice(0, 4).join(lang === "zh" ? "；" : "; ");
  if (snippet.length > 240) snippet = snippet.slice(0, 237) + "…";
  return snippet.trim();
}

export function extractCustomerFromLineChat(raw: string, lang: string): ExtractedCustomerProfile {
  if (!raw?.trim()) return { ...EMPTY };

  const full = raw.trim();
  const lines = splitChatLines(raw);

  const email = extractEmail(full);
  const phone = extractPhone(full);
  const line_id = extractLineId(full, email);

  let company_name = "";
  for (const line of lines) {
    const zh = extractCompanyZh(line);
    const en = extractCompanyEn(line);
    company_name = zh || en;
    if (company_name) break;
  }

  const customer_name =
    lang === "zh" ? extractExplicitChineseName(full) : extractExplicitEnglishName(full);

  const customerLines = lines.filter((l) => !isLikelyStaffLine(l));
  let customer_need = buildCustomerNeedSnippet(customerLines, lang);

  if (!customer_need && lang === "zh") {
    const want = full.match(/(?:想|需要|希望|麻煩).{4,80}/);
    if (want) customer_need = want[0].trim();
  }

  return {
    customer_name: customer_name.trim(),
    company_name: company_name.trim(),
    phone: phone.trim(),
    line_id: line_id.trim(),
    email: email.trim(),
    customer_need: customer_need.trim(),
  };
}
