import { sendLinePushMessage } from "./lineMessaging";
import { getSupabaseServer } from "./supabaseServer";
import type { DueReminderCustomer } from "./reminderCheck";

export type CustomerPushResult = {
  attempted: number;
  sent: number;
  failed: number;
  errors: string[];
};

type LineUserBinding = {
  line_user_id: string;
  customer_id: string;
};

/** Personal LINE reminder body sent to a bound customer. */
export function formatCustomerFollowUpMessage(
  customerName: string | null | undefined,
  followUpNote: string | null | undefined,
): string {
  const name = (customerName?.trim() || "您").trim();
  const note = (followUpNote?.trim() || "提醒您與我們聯繫，謝謝！").trim();
  return `您好 ${name}，\n${note}`;
}

/**
 * For each due customer, look up `line_users.customer_id` bindings and push a
 * personalized reminder via LINE Push API. Safe to call with empty input.
 */
export async function pushDueCustomerReminders(
  due: DueReminderCustomer[],
  channelAccessToken: string,
): Promise<CustomerPushResult> {
  const result: CustomerPushResult = { attempted: 0, sent: 0, failed: 0, errors: [] };
  if (due.length === 0) return result;
  if (!channelAccessToken.trim()) {
    result.errors.push("missing_channel_access_token");
    return result;
  }

  const customerIds = Array.from(new Set(due.map((c) => String(c.id))));
  if (customerIds.length === 0) return result;

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("line_users")
    .select("line_user_id, customer_id")
    .in("customer_id", customerIds);

  if (error) {
    result.errors.push(`line_users_lookup: ${error.message}`);
    return result;
  }

  const bindings = (data ?? []) as LineUserBinding[];
  if (bindings.length === 0) return result;

  const customersById = new Map(due.map((c) => [String(c.id), c]));

  await Promise.all(
    bindings.map(async (binding) => {
      const customer = customersById.get(String(binding.customer_id));
      if (!customer || !binding.line_user_id) return;

      const message = formatCustomerFollowUpMessage(
        customer.customer_name,
        customer.follow_up_note,
      );

      result.attempted += 1;
      const push = await sendLinePushMessage(message, channelAccessToken, binding.line_user_id);
      if (push.ok) {
        result.sent += 1;
      } else {
        result.failed += 1;
        if (push.error) {
          result.errors.push(`${binding.line_user_id}: ${push.error}`);
        }
      }
    }),
  );

  return result;
}
