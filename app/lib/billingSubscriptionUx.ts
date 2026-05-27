/** Display-only helpers for billing UI (does not affect quota or gating). */

export const SUBSCRIPTION_NEAR_EXPIRY_DAYS = 7;

export type BillingSubscriptionUxInput = {
  subscriptionPlan: string;
  hasActivePaidSubscription: boolean;
  trialExpired: boolean;
  paidUntil: string | null;
  trialEndsAt: string | null;
};

export function subscriptionAccessLabel(input: BillingSubscriptionUxInput): "啟用中" | "已到期" {
  if (input.hasActivePaidSubscription) return "啟用中";
  if (input.subscriptionPlan === "trial" && !input.trialExpired) return "啟用中";
  return "已到期";
}

export function isSubscriptionExpiredForUx(input: BillingSubscriptionUxInput): boolean {
  return subscriptionAccessLabel(input) === "已到期";
}

export function subscriptionExpiryDateDisplay(
  input: BillingSubscriptionUxInput,
): string {
  const raw =
    input.hasActivePaidSubscription && input.paidUntil
      ? input.paidUntil
      : input.trialEndsAt;
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("zh-TW");
}

export function isSubscriptionNearExpiration(
  input: BillingSubscriptionUxInput,
  now = new Date(),
): boolean {
  if (isSubscriptionExpiredForUx(input)) return false;

  const raw =
    input.hasActivePaidSubscription && input.paidUntil
      ? input.paidUntil
      : input.trialEndsAt;
  if (!raw) return false;

  const end = new Date(raw);
  if (Number.isNaN(end.getTime())) return false;

  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return false;

  const days = ms / (24 * 60 * 60 * 1000);
  return days <= SUBSCRIPTION_NEAR_EXPIRY_DAYS;
}

export function formatAiRemainingDisplay(remaining: number, limit: number): string {
  if (limit >= 2147483647) return "不限次數";
  return `${remaining} / ${limit}`;
}
