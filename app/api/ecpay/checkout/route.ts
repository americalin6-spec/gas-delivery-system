import { NextResponse } from "next/server";
import { requireApiAuth } from "../../../lib/apiAuth";
import { ECPAY_NOT_IMPLEMENTED, isEcpayConfigured } from "../../../lib/ecpayArchitecture";
import {
  createSubscriptionEcpayCheckout,
  readEcpayFullConfig,
  resolveEcpaySubscriptionCheckoutPlan,
} from "../../../lib/ecpayServer";
import { getCreditPackById } from "../../../lib/subscriptionPlans";

type Body = {
  plan?: string;
  credit_pack_id?: string;
  payment_method?: string;
};

const ALLOWED_PAYMENT_METHODS = [
  "credit_recurring",
  "credit_once",
  "atm",
  "cvs",
] as const;

type EcpayPaymentMethod = (typeof ALLOWED_PAYMENT_METHODS)[number];

function parsePaymentMethod(raw: string | undefined): EcpayPaymentMethod | null {
  const method = raw?.trim() ?? "";
  if (!method) return null;
  return ALLOWED_PAYMENT_METHODS.includes(method as EcpayPaymentMethod)
    ? (method as EcpayPaymentMethod)
    : null;
}

/** POST — ECPay checkout (subscription: live gateway; AI credits: not yet). */
export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const creditPackId = body.credit_pack_id?.trim() ?? "";
  if (creditPackId) {
    const pack = getCreditPackById(creditPackId);
    if (!pack) {
      return NextResponse.json(
        { ok: false, error: "請選擇有效的 AI 點數方案" },
        { status: 400 },
      );
    }

    const paymentMethod =
      parsePaymentMethod(body.payment_method) ?? "credit_once";
    if (body.payment_method?.trim() && !parsePaymentMethod(body.payment_method)) {
      return NextResponse.json({ ok: false, error: "不支援的付款方式" }, { status: 400 });
    }

    return NextResponse.json({
      ok: false,
      intent: "ai_credits",
      ecpayConfigured: isEcpayConfigured(),
      companyId: auth.companyId,
      creditPackId: pack.id,
      paymentMethod,
      error: ECPAY_NOT_IMPLEMENTED,
      redirectUrl: null,
      message: "ECPay AI 點數一次性付款尚未啟用，請稍後再試。",
    });
  }

  const planInput = body.plan?.trim().toLowerCase() ?? "";
  const resolved = resolveEcpaySubscriptionCheckoutPlan(planInput);
  if ("error" in resolved) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 });
  }

  const paymentMethod =
    parsePaymentMethod(body.payment_method) ?? "credit_recurring";
  if (body.payment_method?.trim() && !parsePaymentMethod(body.payment_method)) {
    return NextResponse.json({ ok: false, error: "不支援的付款方式" }, { status: 400 });
  }

  if (paymentMethod !== "credit_recurring") {
    return NextResponse.json(
      {
        ok: false,
        error: "訂閱方案僅支援信用卡定期定額（credit_recurring）",
      },
      { status: 400 },
    );
  }

  const config = readEcpayFullConfig();
  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ECPay 尚未設定完整，請設定 ECPAY_MERCHANT_ID、ECPAY_HASH_KEY、ECPAY_HASH_IV、ECPAY_RETURN_URL、ECPAY_CLIENT_BACK_URL",
      },
      { status: 503 },
    );
  }

  try {
    const launchOrigin = new URL(req.url).origin;
    const checkout = createSubscriptionEcpayCheckout({
      config,
      companyId: auth.companyId,
      userId: auth.user.id,
      plan: resolved.plan,
      catalog: resolved.catalog,
      launchOrigin,
    });

    return NextResponse.json({
      ok: true,
      intent: "subscription",
      companyId: auth.companyId,
      plan: resolved.plan,
      paymentMethod,
      merchantTradeNo: checkout.merchantTradeNo,
      amountTwd: resolved.catalog.ecpayPeriodAmount,
      redirectUrl: checkout.redirectUrl,
    });
  } catch (err) {
    console.error("[api/ecpay/checkout]", err);
    const message =
      err instanceof Error ? err.message : "無法建立 ECPay 結帳連結，請稍後再試";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
