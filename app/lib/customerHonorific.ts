/**
 * Resolve customer address forms for follow-up greetings (先生/小姐, Mr./Ms., English names).
 * Does not mutate CRM customer_name — display-only for messages.
 */

export type HonorificResolveInput = {
  customerName?: string | null;
  rawText?: string | null;
  lang?: "zh" | "en";
};

export type ResolvedCustomerHonorific = {
  addressName: string;
  greetingZh: string;
  greetingEn: string;
};

const FEMALE_NAME_HINTS = new Set([
  "amanda",
  "emily",
  "cindy",
  "amy",
  "sarah",
  "jessica",
  "linda",
  "mary",
  "lisa",
  "anna",
  "sophie",
  "grace",
  "helen",
  "betty",
  "nancy",
  "karen",
  "susan",
  "laura",
  "michelle",
  "olivia",
  "emma",
  "chloe",
  "zoe",
  "ruby",
  "fiona",
  "irene",
  "vera",
  "vivian",
  "yuki",
  "mei",
  "ling",
  "hui",
  "fang",
  "wen",
]);

const MALE_NAME_HINTS = new Set([
  "kevin",
  "jason",
  "david",
  "john",
  "michael",
  "james",
  "robert",
  "william",
  "richard",
  "thomas",
  "charles",
  "daniel",
  "paul",
  "mark",
  "andrew",
  "steven",
  "brian",
  "eric",
  "alex",
  "ryan",
  "tony",
  "andy",
  "peter",
  "george",
  "henry",
  "jack",
  "sam",
  "ben",
  "chris",
]);

const FEMALE_CONTEXT_RE =
  /(?:我是|叫我|我姓)[\u4e00-\u9fff]{0,3}小姐|小姐[，,、\s]|女性|女生客戶|女客|Ms\.?\s|Mrs\.?\s|\bms\b|\bmrs\b/i;

const MALE_CONTEXT_RE =
  /(?:我是|叫我|我姓)[\u4e00-\u9fff]{0,3}先生|先生[，,、\s]|男性|男生客戶|男客|Mr\.?\s|\bmr\b/i;

function normalizeEnglishName(value: string): string {
  const t = value.trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function inferGenderFromContext(text: string, englishName?: string): "male" | "female" | "unknown" {
  const t = text.trim();
  if (!t && !englishName) return "unknown";

  if (englishName) {
    const lower = englishName.toLowerCase();
    if (FEMALE_NAME_HINTS.has(lower)) return "female";
    if (MALE_NAME_HINTS.has(lower)) return "male";
  }

  if (FEMALE_CONTEXT_RE.test(t)) return "female";
  if (MALE_CONTEXT_RE.test(t)) return "male";
  return "unknown";
}

function extractHonorificFromRawText(rawText: string): string {
  const text = rawText.trim();
  if (!text) return "";

  const zhExplicit =
    text.match(/(?:我是|我叫|可以叫我)\s*([\u4e00-\u9fff]{1,3})(先生|小姐)/u) ??
    text.match(/(?:稱呼我|称呼我)\s*([\u4e00-\u9fff]{1,3})(先生|小姐)/u);
  if (zhExplicit?.[1] && zhExplicit[2]) {
    return `${zhExplicit[1]}${zhExplicit[2]}`;
  }

  const enExplicit =
    text.match(/(?:I'm|I am|my name is|call me)\s+([A-Za-z][A-Za-z.'-]{1,29})(?:\s|[,.!?]|$)/i) ??
    text.match(/(?:我是|我叫)\s+([A-Za-z]{2,30})(?![A-Za-z])/u);
  if (enExplicit?.[1]) {
    return normalizeEnglishName(enExplicit[1]);
  }

  const mrMs = text.match(/\b(Mr|Ms|Mrs)\.?\s+([A-Za-z][A-Za-z.'-]{1,29})\b/i);
  if (mrMs?.[1] && mrMs[2]) {
    const title = mrMs[1].toLowerCase() === "ms" || mrMs[1].toLowerCase() === "mrs" ? "Ms." : "Mr.";
    return `${title} ${normalizeEnglishName(mrMs[2])}`;
  }

  const surname = text.match(/我姓\s*([\u4e00-\u9fff]{1,2})/u);
  if (surname?.[1]) {
    const gender = inferGenderFromContext(text);
    const suffix = gender === "female" ? "小姐" : "先生";
    return `${surname[1]}${suffix}`;
  }

  return "";
}

function parseStoredCustomerName(name: string, contextText: string): string {
  const t = name.trim();
  if (!t) return "";

  if (/^(?:Mr|Ms|Mrs)\.?\s+[A-Za-z]/i.test(t)) return t.replace(/\s+/g, " ").trim();

  if (/^[A-Za-z][A-Za-z.'-]{1,29}$/.test(t)) {
    return normalizeEnglishName(t);
  }

  if (/^[\u4e00-\u9fff]{1,4}(?:先生|小姐)$/.test(t)) return t;

  if (/^[\u4e00-\u9fff]{1,2}$/.test(t)) {
    const gender = inferGenderFromContext(contextText, undefined);
    const suffix = gender === "female" ? "小姐" : "先生";
    return `${t}${suffix}`;
  }

  if (/^[\u4e00-\u9fff]{2,4}$/.test(t)) {
    const gender = inferGenderFromContext(contextText);
    if (gender === "female") return `${t.charAt(0)}小姐`;
    if (gender === "male") return `${t.charAt(0)}先生`;
    return `${t.charAt(0)}先生`;
  }

  return t;
}

function toEnglishHonorific(addressName: string): string {
  const t = addressName.trim();
  if (!t) return "";

  if (/^(?:Mr|Ms|Mrs)\.?\s+/i.test(t)) return t.replace(/\s+/g, " ").trim();

  if (/^[A-Za-z]/.test(t)) return normalizeEnglishName(t);

  const zh = t.match(/^([\u4e00-\u9fff]{1,3})(先生|小姐)$/u);
  if (zh) {
    const title = zh[2] === "小姐" ? "Ms." : "Mr.";
    return `${title} ${zh[1]}`;
  }

  return t;
}

/** Resolve polite address for follow-up (never bare surname + 您好). */
export function resolveCustomerHonorific(input: HonorificResolveInput): ResolvedCustomerHonorific {
  const contextText = [input.rawText, input.customerName].filter(Boolean).join("\n");
  const fromRaw = input.rawText ? extractHonorificFromRawText(input.rawText) : "";
  const fromStored = input.customerName ? parseStoredCustomerName(input.customerName, contextText) : "";

  let addressName = fromRaw || fromStored;

  if (!addressName && input.customerName?.trim()) {
    addressName = parseStoredCustomerName(input.customerName, contextText);
  }

  addressName = addressName.trim();

  if (/^[\u4e00-\u9fff]$/u.test(addressName)) {
    const gender = inferGenderFromContext(contextText);
    addressName = `${addressName}${gender === "female" ? "小姐" : "先生"}`;
  }

  const greetingZh = addressName ? `${addressName}您好` : "您好";
  const enName = toEnglishHonorific(addressName);
  const greetingEn = enName ? `Hi ${enName}` : "Hi there";

  return { addressName, greetingZh, greetingEn };
}
