import type { AiLineFollowUpInput } from "./lineFollowUpReply";
import { prefixCustomerGreeting } from "./lineGreetingUtils";

export type LineReplyTemplateId =
  | "initial_inquiry"
  | "follow_up"
  | "read_no_reply"
  | "after_quote"
  | "appointment_confirm"
  | "thank_you"
  | "not_needed"
  | "high_intent";

export type LineReplyTemplate = {
  id: LineReplyTemplateId;
  label: string;
};

export const LINE_REPLY_TEMPLATES: LineReplyTemplate[] = [
  { id: "initial_inquiry", label: "初次詢問回覆" },
  { id: "follow_up", label: "追蹤客戶" },
  { id: "read_no_reply", label: "已讀未回提醒" },
  { id: "after_quote", label: "報價後追蹤" },
  { id: "appointment_confirm", label: "預約確認" },
  { id: "thank_you", label: "感謝回覆" },
  { id: "not_needed", label: "客戶暫時不需要" },
  { id: "high_intent", label: "高意願客戶追蹤" },
];

function companyPart(customer: AiLineFollowUpInput): string {
  const company = customer.company_name?.trim();
  return company ? `關於${company}這邊，` : "";
}

const TEMPLATE_BODIES: Record<LineReplyTemplateId, (company: string) => string> = {
  initial_inquiry: (company) =>
    `感謝您的詢問！${company}想進一步了解您的需求與使用情境，看看我們能怎麼協助。若方便的話歡迎回覆，謝謝您！`,
  follow_up: (company) =>
    `${company}延續上次聯繫，想跟您同步目前進度與下一步安排。若您有任何想法或需要調整的地方，歡迎隨時告訴我，謝謝！`,
  read_no_reply: () =>
    `想禮貌確認一下先前訊息是否方便回覆。若目前較忙也沒關係，您方便的時候再回覆即可，謝謝您！`,
  after_quote: (company) =>
    `${company}先前提供的報價與方案，想確認您是否還有想討論或調整的地方。若有任何疑問也歡迎提出，我們很樂意協助，謝謝！`,
  appointment_confirm: () =>
    `想與您確認預約時間與相關準備事項是否都沒問題。若需要更改時間或補充資料，請隨時告訴我，謝謝您！`,
  thank_you: (company) =>
    `感謝您的回覆與信任！${company}我們會依討論內容持續協助。若後續還有任何需要，歡迎隨時聯繫，謝謝！`,
  not_needed: () =>
    `了解您目前暫時不需要，我們會先為您保留資料。若之後有合適的時機或需求，歡迎再聯繫我們，祝您一切順利！`,
  high_intent: (company) =>
    `${company}感謝您的高度意願！我們會優先為您安排後續步驟，也想確認您方便的聯繫時間，以便盡快為您服務。期待您的回覆，謝謝！`,
};

/** Build Chinese template body for the LINE reply editor. */
export function buildLineReplyTemplateContent(
  templateId: LineReplyTemplateId,
  customer: AiLineFollowUpInput,
): string {
  const company = companyPart(customer);
  const buildBody = TEMPLATE_BODIES[templateId];
  const body = buildBody
    ? buildBody(company)
    : "想跟您同步一下目前進度。若方便的話歡迎回覆，謝謝您！";

  return prefixCustomerGreeting(customer, body);
}
