/**
 * Industry vs company — business type phrases vs brand/clinic/store names.
 */

import { isValidCompanyName } from "./extractCustomerFromLineChat";
import type { CustomerSocialFieldKey } from "./customerSocialMedia";

export type BusinessDescriptorKind = "industry_only" | "company" | "company_and_industry";

export function normalizeIndustryValue(value: string): string {
  let s = value.trim().replace(/^[「『"'（(]+|[」』"'）)]+$/gu, "");
  s = s.replace(/[，,;；\s]+$/u, "").trim();
  if (!s) return "";
  if (s.length > 64) return s.slice(0, 64);
  return s;
}

function isEmptyLabel(value: string): boolean {
  const n = value.trim();
  if (!n || n === "--" || n === "-") return true;
  const lower = n.toLowerCase();
  return (
    n === "未提供" ||
    n === "未偵測" ||
    lower === "not provided" ||
    lower === "not detected" ||
    lower === "n/a"
  );
}

/** Formal registered company (有限公司, etc.). */
export function isExplicitCompanyName(value: string): boolean {
  const n = normalizeIndustryValue(value);
  if (!n) return false;
  return isValidCompanyName(n);
}

const INDUSTRY_PHRASE_RE =
  /(?:精品家具|義大利進口家具|進口家具|高單價家具|醫美診所|醫美|診所|牙醫診所|健身房|健身中心|餐酒館|餐廳|咖啡廳|咖啡館|火鍋店|燒肉店|美髮沙龍|沙龍|美學診所|復健診所|瑜珈教室|瑜伽館)/u;

const INDUSTRY_CONTEXT_RE =
  /(?:經營|做|是|做著|主打|專做|專營|從事|在做)\s*([^\n，,。；;！!？?]{2,28}(?:家具|診所|健身房|餐酒館|餐廳|咖啡|醫美|牙醫|沙龍|工作室|俱樂部|品牌))/u;

/** Community / transit / retail amenities — not the customer's industry. */
const AMENITY_FACILITY_TERM_RE =
  /健身房|健身中心|游泳池|泳池|公園|公园|捷運|高铁|高鐵|學區|学区|商場|商场|SPA|spa/iu;

/** Property-buyer chat — amenities/layout must not become industry. */
const PROPERTY_SEARCH_SIGNAL_RE =
  /預算|萬|房|厅|廳|室|坪|車位|停車|平面|建案|新建案|高鐵|高铁|捷運|看房|買房|購屋|社區|社区|學區|学区|距離.{0,12}分鐘|分鐘內/u;

const AMENITY_OR_LAYOUT_INDUSTRY_MISLABEL_RE =
  /^(?:健身房|健身中心|游泳池|泳池|SPA|公園|公园|學區|学区|捷運|高鐵|高铁|車位|停車|平面車位|三房|四房|兩房|两房|套房)$/iu;

const AMENITY_FACILITY_CONTEXT_RE =
  /社區|社区|社區裡|社区里|建有|配有|配套|設施|设施|(?:^|[，,。\n])\s*有\s*|近|靠近|周邊|周边|樓下|楼下|步行約|步行到|距離/u;

const I_AM_BUSINESS_OWNER_RE =
  /我是\s*([^\n，,。；;！!？?]{0,20}?(?:健身房|健身中心|瑜珈教室|瑜伽館|診所|诊所|餐廳|餐厅|咖啡廳|咖啡馆|餐酒館|火鍋店|燒肉店|美髮沙龍|沙龍|醫美診所|牙醫診所|工作室))\s*(?:老闆|老板|負責人|負责人|店長|經理|創辦人|创办人)?/u;

const I_RUN_BUSINESS_RE =
  /我(?:開|经营|經營|做|在做|從事|从事)\s*(?:了一?家?)?\s*([^\n，,。；;！!？?]{2,24})/u;

const LABELED_INDUSTRY_INLINE_RE =
  /(?:行業|产业|產業|職業|工作內容|工作内容)[:：\s]\s*([^\n，,。；;]+)/u;

const GENERIC_INDUSTRY_ONLY_RE =
  /^(?:精品家具|義大利進口家具|進口家具|高單價家具|醫美診所|醫美|診所|健身房|健身中心|餐酒館|餐廳|咖啡廳|咖啡館|美髮沙龍|沙龍|瑜珈教室|瑜伽館)$/u;

const INDUSTRY_SUFFIXES_LONGEST_FIRST = [
  "醫美診所",
  "美學診所",
  "牙醫診所",
  "整形診所",
  "健身中心",
  "精品家具",
  "義大利進口家具",
  "進口家具",
  "健身房",
  "餐酒館",
  "咖啡廳",
  "餐廳",
  "工作室",
  "診所",
  "家具",
] as const;

/** Named brand / clinic / store (星采醫美診所, Star Clinic Taipei). */
export function isNamedBrandOrClinic(value: string): boolean {
  const n = normalizeIndustryValue(value);
  if (!n || n.length < 3) return false;
  if (isExplicitCompanyName(n)) return true;

  if (
    /^[\u4e00-\u9fff]{2,14}(?:醫美診所|美學診所|牙醫診所|整形診所|皮膚科診所|診所|工作室|健身房|健身中心|餐廳|咖啡廳|餐酒館|家具店|家具)$/u.test(
      n,
    )
  ) {
    const suffix = INDUSTRY_SUFFIXES_LONGEST_FIRST.find((s) => n.endsWith(s));
    return Boolean(suffix && n.length > suffix.length);
  }

  if (/^[A-Za-z][A-Za-z0-9\s.'&-]{2,48}(?:\s+Clinic|\s+Studio|\s+Gym|\s+Group)?$/i.test(n)) {
    return true;
  }

  return false;
}

/** Business-type descriptor — not a unique brand name. */
export function isIndustryDescriptor(value: string): boolean {
  const n = normalizeIndustryValue(value);
  if (!n || n.length < 2 || n.length > 32) return false;
  if (isExplicitCompanyName(n)) return false;
  if (isNamedBrandOrClinic(n)) return false;
  if (INDUSTRY_PHRASE_RE.test(n)) return true;
  if (/(?:家具|診所|健身房|餐酒館|醫美|咖啡廳|餐廳|沙龍|工作室)/u.test(n) && !/(有限公司|股份有限公司)/u.test(n)) {
    return true;
  }
  return false;
}

export function isGenericIndustryOnly(value: string): boolean {
  const n = normalizeIndustryValue(value);
  if (!n) return false;
  if (GENERIC_INDUSTRY_ONLY_RE.test(n)) return true;
  if (isIndustryDescriptor(n)) return true;
  return false;
}

export function isPropertySearchConversation(fullText: string): boolean {
  const t = fullText.trim();
  if (!t) return false;
  return PROPERTY_SEARCH_SIGNAL_RE.test(t);
}

export function isAmenityOrLayoutIndustryMislabel(value: string): boolean {
  const n = normalizeIndustryValue(value);
  if (!n) return false;
  if (AMENITY_OR_LAYOUT_INDUSTRY_MISLABEL_RE.test(n)) return true;
  if (AMENITY_FACILITY_TERM_RE.test(n) && n.length <= 8) return true;
  return false;
}

function normalizeOccupationFragmentToIndustry(fragment: string): string {
  const raw = normalizeIndustryValue(fragment);
  if (!raw) return "";
  if (isAmenityOrLayoutIndustryMislabel(raw)) return "";
  if (/餐廳|餐厅|餐酒館|火鍋|燒肉|烧肉|咖啡|餐飲|餐饮/u.test(raw)) {
    return "餐飲業";
  }
  if (/健身房|健身中心|\bgym\b/i.test(raw)) {
    return "健身房";
  }
  if (/醫美診所|医美诊所/u.test(raw)) {
    return "醫美診所";
  }
  if (/牙醫診所|牙医诊所/u.test(raw)) {
    return "牙醫診所";
  }
  if (/瑜珈|瑜伽/u.test(raw)) {
    return raw.includes("教室") || raw.includes("館") ? raw : "瑜珈教室";
  }
  if (isIndustryDescriptor(raw) && !isAmenityOrLayoutIndustryMislabel(raw)) {
    return raw;
  }
  return "";
}

function isAmenityFacilityContext(fullText: string, candidate: string): boolean {
  const t = fullText.trim();
  const term = normalizeIndustryValue(candidate);
  if (!t || !term || !AMENITY_FACILITY_TERM_RE.test(term)) {
    return false;
  }
  const explicit = extractExplicitOccupationIndustry(t);
  if (explicit && (explicit === term || explicit.includes(term) || term.includes(explicit))) {
    return false;
  }
  if (!AMENITY_FACILITY_CONTEXT_RE.test(t)) {
    return false;
  }
  return AMENITY_FACILITY_TERM_RE.test(t);
}

export function extractExplicitOccupationIndustry(fullText: string): string {
  const t = fullText.trim();
  if (!t) return "";

  const labeled = t.match(LABELED_INDUSTRY_INLINE_RE);
  if (labeled?.[1]) {
    const v = normalizeIndustryValue(labeled[1]);
    if (v && !isEmptyLabel(v)) return v;
  }

  const owner = t.match(I_AM_BUSINESS_OWNER_RE);
  if (owner?.[1]) {
    const v = normalizeOccupationFragmentToIndustry(owner[1]);
    if (v) return v;
  }

  const runner = t.match(I_RUN_BUSINESS_RE);
  if (runner?.[1]) {
    const v = normalizeOccupationFragmentToIndustry(runner[1]);
    if (v) return v;
  }

  const contextual = t.match(INDUSTRY_CONTEXT_RE);
  if (contextual?.[1]) {
    const v = normalizeOccupationFragmentToIndustry(contextual[1]);
    if (v && !isAmenityFacilityContext(t, v)) return v;
  }

  return "";
}

export function extractIndustrySuffixFromCompany(companyName: string): string {
  const n = normalizeIndustryValue(companyName);
  if (!n) return "";

  for (const suffix of INDUSTRY_SUFFIXES_LONGEST_FIRST) {
    if (n.endsWith(suffix) && n.length > suffix.length) return suffix;
  }

  if (GENERIC_INDUSTRY_ONLY_RE.test(n)) return n;
  return "";
}

export function classifyBusinessDescriptor(value: string): BusinessDescriptorKind {
  const n = normalizeIndustryValue(value);
  if (!n) return "industry_only";
  if (isExplicitCompanyName(n)) return "company";
  if (isNamedBrandOrClinic(n)) return "company_and_industry";
  if (isGenericIndustryOnly(n)) return "industry_only";
  return "industry_only";
}

export function resolveCompanyAndIndustryFromDescriptor(descriptor: string): {
  company_name: string;
  industry: string;
} {
  const n = normalizeIndustryValue(descriptor);
  if (!n) return { company_name: "", industry: "" };

  const kind = classifyBusinessDescriptor(n);
  if (kind === "industry_only") {
    return { company_name: "", industry: n };
  }
  if (kind === "company") {
    return { company_name: n, industry: "" };
  }
  const company_name = n;
  const industry = extractIndustrySuffixFromCompany(company_name) || "";
  return { company_name, industry };
}

export function isLikelySocialAccountName(
  value: string,
  social: Partial<Record<CustomerSocialFieldKey, string>>,
): boolean {
  const v = value.trim();
  if (!v) return false;
  if (isNamedBrandOrClinic(v)) return false;

  const lower = v.toLowerCase();
  for (const raw of Object.values(social)) {
    const s = String(raw ?? "").trim();
    if (s && s.toLowerCase() === lower) return true;
  }

  if (/^@?[a-z0-9._-]{3,40}$/i.test(v) && !/[\u4e00-\u9fff]/.test(v)) return true;
  return false;
}

export function pickSemanticCompanyName(
  labeledCompany: string,
  regexCompany: string,
  aiCompany: string,
  social: Partial<Record<CustomerSocialFieldKey, string>>,
): string {
  const fromLabel = normalizeIndustryValue(labeledCompany);
  if (fromLabel) {
    const kind = classifyBusinessDescriptor(fromLabel);
    if (kind === "company" || kind === "company_and_industry") return fromLabel;
  }

  const fromRegex = normalizeIndustryValue(regexCompany);
  if (fromRegex) {
    const kind = classifyBusinessDescriptor(fromRegex);
    if (kind === "company" || kind === "company_and_industry") return fromRegex;
  }

  const fromAi = normalizeIndustryValue(aiCompany);
  if (fromAi && !isEmptyLabel(fromAi) && !isLikelySocialAccountName(fromAi, social)) {
    const kind = classifyBusinessDescriptor(fromAi);
    if (kind === "company" || kind === "company_and_industry") return fromAi;
  }

  return "";
}

export function pickSemanticIndustry(
  labeledIndustry: string,
  regexIndustry: string,
  aiIndustry: string,
  companyName: string,
  fullText: string,
): string {
  const fromLabel = normalizeIndustryValue(labeledIndustry);
  if (fromLabel) return fromLabel;

  const fromSuffix = companyName ? extractIndustrySuffixFromCompany(companyName) : "";
  if (fromSuffix) return fromSuffix;

  const fromRegex = normalizeIndustryValue(regexIndustry);
  if (fromRegex && isIndustryDescriptor(fromRegex)) return fromRegex;

  const fromAi = normalizeIndustryValue(aiIndustry);
  if (fromAi && !isEmptyLabel(fromAi)) return fromAi;

  return extractIndustryPhrasesFromText(fullText);
}

/** Scan conversation for industry phrases (labeled lines handled separately). */
export function extractIndustryPhrasesFromText(fullText: string): string {
  const t = fullText.trim();
  if (!t) return "";

  const direct = t.match(INDUSTRY_PHRASE_RE);
  if (direct?.[0]) {
    const v = normalizeIndustryValue(direct[0]);
    if (v && isIndustryDescriptor(v)) return v;
  }

  const contextual = t.match(INDUSTRY_CONTEXT_RE);
  if (contextual?.[1]) {
    const v = normalizeIndustryValue(contextual[1]);
    if (v && isIndustryDescriptor(v)) return v;
  }

  return "";
}

export function demoteInferredCompanyToIndustry(
  companyName: string,
  labeledCompanyLine: string,
  currentIndustry: string,
  fullText = "",
): { company_name: string; industry: string } {
  const company = companyName.trim();
  let industry = currentIndustry.trim();
  if (!company) return { company_name: "", industry };

  if (isPropertySearchConversation(fullText) && !extractExplicitOccupationIndustry(fullText)) {
    return {
      company_name:
        isGenericIndustryOnly(company) || isAmenityOrLayoutIndustryMislabel(company) ? "" : company,
      industry: "",
    };
  }

  if (labeledCompanyLine.trim()) {
    const suffix = extractIndustrySuffixFromCompany(company);
    if (suffix && !industry && !isAmenityOrLayoutIndustryMislabel(suffix)) {
      industry = suffix;
    }
    return { company_name: company, industry };
  }

  if (isExplicitCompanyName(company) || isNamedBrandOrClinic(company)) {
    const suffix = extractIndustrySuffixFromCompany(company);
    if (suffix && !industry && !isAmenityOrLayoutIndustryMislabel(suffix)) {
      industry = suffix;
    }
    return { company_name: company, industry };
  }

  if (isGenericIndustryOnly(company)) {
    if (isAmenityOrLayoutIndustryMislabel(company)) {
      return { company_name: "", industry: "" };
    }
    return {
      company_name: "",
      industry: industry || company,
    };
  }

  return { company_name: company, industry };
}
