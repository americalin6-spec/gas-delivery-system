/** Deal probability considered "high" for auto follow-up scheduling */
export function isHighDealProbability(rate?: unknown): boolean {
  if (rate == null) return false;
  const t = String(rate).trim().toLowerCase();
  if (!t) return false;
  return (
    t === "高" ||
    t === "high" ||
    t === "90%" ||
    t.includes("高") ||
    /^high\b/i.test(String(rate).trim())
  );
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar date YYYY-MM-DD (avoid UTC shift for DATE columns) */
export function formatLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Random 1–3 days from today */
export function computeHighPotentialFollowUpDate(): string {
  const offsetDays = 1 + Math.floor(Math.random() * 3);
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return formatLocalYmd(d);
}

/** Coerce DB/API values (string, Date, ISO timestamp) to calendar YYYY-MM-DD or null */
export function normalizeFollowUpDateValue(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatLocalYmd(value);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const head = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (!head) return null;
  return parseLocalYmd(head[1]) ? head[1] : null;
}

export function parseLocalYmd(input: unknown): Date | null {
  if (input == null) return null;
  let s: string;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    s = formatLocalYmd(input);
  } else {
    s = String(input).trim();
  }
  const head = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (!head) return null;
  const ymd = head[1];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(y, mo, day);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null;
  return d;
}

export type FollowUpBadge = "none" | "overdue" | "soon" | "upcoming";

export function getFollowUpBadge(followUpDate?: unknown): FollowUpBadge {
  const ymd = normalizeFollowUpDateValue(followUpDate);
  if (!ymd) return "none";
  const target = parseLocalYmd(ymd);
  if (!target) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (86400 * 1000));
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "soon";
  return "upcoming";
}

export type SuggestionCustomer = {
  customer_name?: string | null;
  company_name?: string | null;
  customer_need?: string | null;
  next_step?: string | null;
  follow_up?: string | null;
};

/** Template for salesperson — not sent automatically */
export function buildSuggestedSalesFollowUp(c: SuggestionCustomer, lang: "zh" | "en"): string {
  const name = c.customer_name?.trim();
  const company = c.company_name?.trim();
  const need = c.customer_need?.trim();
  const next = c.next_step?.trim();
  const aiFollow = c.follow_up?.trim();

  if (lang === "zh") {
    const greeting = name ? `${name} 您好` : "您好";
    const co = company ? `（${company}）` : "";
    const needLine = need ? `先前聊到「${need}」，想跟您同步最新進度。` : "想跟您確認目前的想法與時間安排。";
    const nextLine = next ? `建議下一步：${next}。` : "若有任何調整也歡迎直接告訴我。";
    const ref = aiFollow ? `（內部追蹤備註：${aiFollow}）` : "";
    return `${greeting}${co}，${needLine}${nextLine}${ref} 這邊先不打擾太久，期待您的回覆，謝謝！`;
  }

  const greeting = name ? `Hi ${name}` : "Hi there";
  const co = company ? ` (${company})` : "";
  const needLine = need
    ? `Following up on "${need}" — wanted to share a quick update.`
    : "Just checking in on timing and next steps.";
  const nextLine = next ? `Suggested next step: ${next}.` : "Let me know if anything has changed on your side.";
  const ref = aiFollow ? ` (Internal note: ${aiFollow})` : "";
  return `${greeting}${co}, ${needLine} ${nextLine}${ref} Thanks, looking forward to hearing from you.`;
}

export function formatFollowUpDateDisplay(ymd: unknown, locale: "zh" | "en"): string {
  const normalized = normalizeFollowUpDateValue(ymd);
  if (!normalized) return "";
  const d = parseLocalYmd(normalized);
  if (!d) return normalized;
  try {
    return d.toLocaleDateString(locale === "zh" ? "zh-TW" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return normalized;
  }
}
