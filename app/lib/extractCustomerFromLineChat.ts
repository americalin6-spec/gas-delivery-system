/**
 * Heuristic extraction from pasted LINE-style chats (no external AI API).
 * Fills CRM-oriented fields for manual review before save.
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

function normalizeNameCompareToken(value: string): string {
  return value
    .replace(/[！!？?。.,，~～\s]/g, "")
    .trim()
    .toLowerCase();
}

/** Opening lines that must never be treated as a customer name. */
export function isGreetingName(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;

  const compact = normalizeNameCompareToken(raw);
  if (!compact) return true;
  if (GREETING_NAME_TOKENS.has(compact)) return true;
  if (GREETING_NAME_TOKENS.has(raw)) return true;

  // Short greeting-only phrases (e.g. "你好呀")
  if (raw.length <= 6) {
    for (const g of GREETING_NAME_TOKENS) {
      if (compact === g || compact.startsWith(g)) return true;
    }
  }

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

export function isValidExtractedCustomerName(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed) && !isNotProvidedLabel(trimmed) && !isGreetingName(trimmed);
}

/** Form / preview display value for customer name (never a greeting or first-line guess). */
export function resolveCustomerNameForForm(raw: string, lang: string): string {
  if (!isValidExtractedCustomerName(raw)) {
    return lang === "zh" ? NAME_NOT_PROVIDED_ZH : NAME_NOT_PROVIDED_EN;
  }
  return raw.trim();
}

/** Value to persist in CRM — null when no real name. */
export function customerNameForCrm(displayName: string, lang: string): string | null {
  const placeholder = lang === "zh" ? NAME_NOT_PROVIDED_ZH : NAME_NOT_PROVIDED_EN;
  const trimmed = displayName.trim();
  if (!trimmed || trimmed === placeholder) return null;
  if (!isValidExtractedCustomerName(trimmed)) return null;
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

function extractNameZh(line: string): string {
  const pats = [
    /敝姓\s*([^\s，。]{1,6})/,
    /我\s*姓\s*([^\s，。]{1,6})/,
    /我是\s*([^\s，。\n]{1,12})/,
    /叫我\s*([^\s，。\n]{1,12})/,
    /稱呼\s*(?:我\s*)?([^\s，。\n]{1,12})/,
    /^客戶[：:]\s*(.{1,24}?)(?:[,，。]|$)/,
    /^對方[：:]\s*(.{1,24}?)(?:[,，。]|$)/,
  ];
  for (const re of pats) {
    const m = line.match(re);
    if (m?.[1]) {
      const n = m[1].trim();
      if (n.length >= 1 && !/有限公司|股份/.test(n)) return n.replace(/經理|主任|小姐|先生/g, "").trim() || n;
    }
  }
  return "";
}

function extractNameEn(line: string): string {
  const m =
    line.match(/(?:I'm|I am)\s+([A-Za-z][A-Za-z\s.'-]{1,40})(?:[,.]|$)/i) ||
    line.match(/my name is\s+([A-Za-z][A-Za-z\s.'-]{1,40})(?:[,.]|$)/i);
  return m?.[1]?.trim() ?? "";
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

function isLikelyCustomerLine(line: string): boolean {
  return (
    /^客戶[：:]/.test(line) ||
    /^對方[：:]/.test(line) ||
    /^client[：:]/i.test(line) ||
    /^customer[：:]/i.test(line)
  );
}

function stripSpeakerPrefix(line: string): string {
  return line.replace(/^(?:客戶|對方|client|customer)[：:\s]+/i, "").trim();
}

/** Summarize need from customer-side lines */
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

  let customer_name = "";
  for (const line of lines) {
    const zh = lang === "zh" ? extractNameZh(line) : "";
    const en = lang !== "zh" ? extractNameEn(line) : "";
    const labeled = isLikelyCustomerLine(line) ? stripSpeakerPrefix(line) : "";
    const candidate = zh || en || labeled;
    if (
      candidate &&
      !/^[\d\s]+$/.test(candidate) &&
      isValidExtractedCustomerName(candidate)
    ) {
      customer_name = candidate;
      break;
    }
  }

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
