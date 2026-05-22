import type { AppLang } from "./appLang";
import { resolveCustomerHonorific } from "./customerHonorific";
import {
  customerStatusLabel,
  getRawCustomerStatus,
  normalizeCustomerStatus,
} from "./customerStatus";
import { parseTimestamp } from "./followUpWorkspace";
import { isHighDealProbability } from "./followUpReminders";

export type AiLineFollowUpInput = {
  customer_name?: string | null;
  company_name?: string | null;
  customer_status?: unknown;
  status?: unknown;
  customer_need?: string | null;
  note?: string | null;
  success_rate?: string | null;
  last_contacted_at?: string | null;
  last_contact_at?: string | null;
  reply_suggestion?: string | null;
  next_step?: string | null;
  follow_up?: string | null;
  raw_text?: string | null;
};

function clipText(text: string, maxLen: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen).trim()}…`;
}

function daysSinceContact(lastAt: Date | null): number | null {
  if (!lastAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(lastAt);
  d.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}

function statusFollowAngleZh(status: ReturnType<typeof normalizeCustomerStatus>): string {
  switch (status) {
    case "new_lead":
      return "想進一步了解您的需求，看看我們能怎麼協助。";
    case "negotiating":
      return "延續上次洽談，想跟您同步目前進度與下一步。";
    case "quoted":
      return "先前提供的報價與方案，想確認您是否還有想調整或討論的地方。";
    case "waiting_reply":
      return "想禮貌確認一下，先前訊息是否方便回覆。";
    case "scheduled":
      return "想確認近期安排的行程與準備事項是否都順利。";
    case "in_progress":
      return "專案進行中，想跟您更新目前狀況並確認是否有需要支援的地方。";
    case "won":
    case "completed":
      return "感謝先前的合作，也想關心一下後續是否還有需要協助的地方。";
    case "cancelled":
    case "invalid":
      return "想簡短致意，若之後有合適的機會也歡迎再聯繫。";
    default:
      return "想跟您同步一下目前進度。";
  }
}

function statusFollowAngleEn(status: ReturnType<typeof normalizeCustomerStatus>): string {
  switch (status) {
    case "new_lead":
      return "I'd like to learn more about your needs and how we can help.";
    case "negotiating":
      return "Following up on our last discussion with a quick progress check.";
    case "quoted":
      return "Checking whether you had any questions about the quote or proposal we shared.";
    case "waiting_reply":
      return "A gentle follow-up to see if you had a chance to review my last message.";
    case "scheduled":
      return "Confirming upcoming plans and whether anything needs adjusting.";
    case "in_progress":
      return "Sharing a quick project update and checking if you need any support.";
    case "won":
    case "completed":
      return "Thank you again for working with us — checking if anything else is needed.";
    case "cancelled":
    case "invalid":
      return "Reaching out briefly in case timing works better later.";
    default:
      return "Wanted to share a quick progress update.";
  }
}

function contactGapPhraseZh(days: number | null): string {
  if (days == null) return "";
  if (days >= 14) return "好久沒聯繫，";
  if (days >= 4) return "前陣子聊過之後，";
  if (days >= 1) return "延續上次聯繫，";
  return "剛聊過不久，";
}

function contactGapPhraseEn(days: number | null): string {
  if (days == null) return "";
  if (days >= 14) return "It's been a while since we last spoke, so ";
  if (days >= 4) return "Following up after our recent chat, ";
  if (days >= 1) return "Picking up from our last contact, ";
  return "Building on our recent conversation, ";
}

/** Context-aware LINE follow-up draft for salesperson copy/paste. */
export function buildAiLineFollowUpReply(
  input: AiLineFollowUpInput,
  lang: AppLang,
): string {
  const status = normalizeCustomerStatus(getRawCustomerStatus(input));
  const need =
    input.customer_need?.trim() ||
    input.reply_suggestion?.trim() ||
    input.follow_up?.trim() ||
    "";
  const note = input.note?.trim() ?? "";
  const company = input.company_name?.trim() ?? "";
  const rate = input.success_rate?.trim() ?? "";
  const nextStep = input.next_step?.trim() ?? "";
  const lastAt =
    parseTimestamp(input.last_contacted_at) ?? parseTimestamp(input.last_contact_at);
  const gapDays = daysSinceContact(lastAt);

  const { greetingZh, greetingEn } = resolveCustomerHonorific({
    customerName: input.customer_name,
    rawText: input.raw_text,
    lang,
  });

  if (lang === "zh") {
    const gap = contactGapPhraseZh(gapDays);
    const companyPart = company ? `關於${company}這邊，` : "";
    const needPart = need
      ? `先前聊到${formatNeedSnippetZh(need)}，`
      : "";
    const notePart =
      note && note !== need ? `另外也留意到${clipText(note, 36)}，` : "";
    const ratePart = isHighDealProbability(rate)
      ? `以目前評估（${clipText(rate, 12)}），我們會優先協助您推進。`
      : rate
        ? `目前評估為「${clipText(rate, 12)}」。`
        : "";
    const stepPart = nextStep ? `建議下一步：${clipText(nextStep, 40)}。` : "";
    const statusLabel = customerStatusLabel(status, "zh");
    const statusPart =
      status !== "new_lead" ? `目前階段為「${statusLabel}」，` : "";

    return `${greetingZh}，${gap}${companyPart}${needPart}${statusPart}${statusFollowAngleZh(status)}${notePart}${ratePart}${stepPart}若方便的話歡迎回覆，謝謝您！`
      .replace(/，{2,}/g, "，")
      .replace(/。+/g, "。");
  }

  const gap = contactGapPhraseEn(gapDays);
  const companyPart = company ? `Regarding ${company}, ` : "";
  const needPart = need ? `Earlier we discussed ${formatNeedSnippetEn(need)}. ` : "";
  const notePart =
    note && note !== need ? `I also noted ${clipText(note, 48)}. ` : "";
  const ratePart = isHighDealProbability(rate)
    ? `Based on our assessment (${clipText(rate, 24)}), we can prioritize your request. `
    : rate
      ? `Current assessment: ${clipText(rate, 24)}. `
      : "";
  const stepPart = nextStep ? `Suggested next step: ${clipText(nextStep, 60)}. ` : "";
  const statusLabel = customerStatusLabel(status, "en");
  const statusPart = status !== "new_lead" ? `Stage: ${statusLabel}. ` : "";

  return `${greetingEn}, ${gap}${companyPart}${needPart}${statusPart}${statusFollowAngleEn(status)}${notePart}${ratePart}${stepPart}Please let me know when you have a moment. Thank you!`
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatNeedSnippetZh(need: string): string {
  const chips = need
    .split(/[、,，]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (chips.length === 0) return clipText(need, 40);
  if (chips.length === 1) return chips[0];
  if (chips.length === 2) return `${chips[0]}以及${chips[1]}`;
  return `${chips.slice(0, -1).join("、")}，以及${chips[chips.length - 1]}`;
}

function formatNeedSnippetEn(need: string): string {
  const chips = need
    .split(/[,、]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (chips.length === 0) return clipText(need, 60);
  if (chips.length === 1) return chips[0];
  if (chips.length === 2) return `${chips[0]} and ${chips[1]}`;
  return `${chips.slice(0, -1).join(", ")}, and ${chips[chips.length - 1]}`;
}
