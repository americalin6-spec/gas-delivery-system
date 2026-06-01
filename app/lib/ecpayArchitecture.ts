import "server-only";

/**
 * ECPay billing architecture (stubs only — no live API calls).
 * Implements CheckMacValue / Period payment in a future pass.
 */

import type { RecurringPaidPlan } from "./billingSettings";
import { RECURRING_PLAN_DEFINITIONS } from "./billingSettings";
import { isEcpayCheckoutConfigured, readEcpayFullConfig } from "./ecpayServer";

export const ECPAY_NOT_IMPLEMENTED =
  "ECPay 金流串接開發中，目前僅完成架構預留";

export type EcpayEnvironment = "staging" | "production";

export type EcpayServerConfig = {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  env: EcpayEnvironment;
};

export type EcpayCheckoutStubRequest = {
  companyId: number;
  userId: string;
  plan: RecurringPaidPlan;
  paymentMethod: "credit_recurring" | "credit_once" | "atm" | "cvs";
};

export type EcpayCallbackStubPayload = {
  MerchantTradeNo?: string;
  RtnCode?: string;
  TradeNo?: string;
  /** 定期定額授權 / 扣款結果 */
  PeriodType?: string;
};

export function isEcpayConfigured(): boolean {
  return isEcpayCheckoutConfigured();
}

export function readEcpayServerConfig(): EcpayServerConfig | null {
  const full = readEcpayFullConfig();
  if (!full) return null;
  return {
    merchantId: full.merchantId,
    hashKey: full.hashKey,
    hashIv: full.hashIv,
    env: full.env,
  };
}

/** Future: build PeriodAction form POST to ECPay. */
export function buildEcpayPeriodCheckoutStub(
  _req: EcpayCheckoutStubRequest,
): { ok: false; error: string } {
  const plan = RECURRING_PLAN_DEFINITIONS[_req.plan];
  if (_req.plan === "enterprise" && plan.ecpayPeriodAmount <= 0) {
    return { ok: false, error: "Enterprise 方案請聯絡業務開通" };
  }
  return { ok: false, error: ECPAY_NOT_IMPLEMENTED };
}

/** Future: verify CheckMacValue on payment return URL. */
export function handleEcpayPaymentCallbackStub(
  _payload: EcpayCallbackStubPayload,
): { ok: false; error: string } {
  return { ok: false, error: ECPAY_NOT_IMPLEMENTED };
}

/** Future: verify CheckMacValue on recurring period notification. */
export function handleEcpayPeriodCallbackStub(
  _payload: EcpayCallbackStubPayload,
): { ok: false; error: string } {
  return { ok: false, error: ECPAY_NOT_IMPLEMENTED };
}

/**
 * Future: after successful recurring charge, update company:
 * subscription_status = active, subscription_plan, paid_until
 */
export type ApplyEcpaySubscriptionParams = {
  companyId: number;
  plan: RecurringPaidPlan;
  paidUntil: string;
  merchantTradeNo?: string;
  periodTradeNo?: string;
};

export async function applyEcpaySubscriptionStub(
  _params: ApplyEcpaySubscriptionParams,
): Promise<{ ok: false; error: string }> {
  return { ok: false, error: ECPAY_NOT_IMPLEMENTED };
}
