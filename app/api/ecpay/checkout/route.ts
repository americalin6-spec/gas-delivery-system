import { NextResponse } from "next/server";
import { requireApiAuth } from "../../../lib/apiAuth";
import { isRecurringPaidPlan } from "../../../lib/billingSettings";
import {
  buildEcpayPeriodCheckoutStub,
  ECPAY_NOT_IMPLEMENTED,
  isEcpayConfigured,
} from "../../../lib/ecpayArchitecture";
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

/** POST — ECPay checkout architecture stub (no live gateway yet). */
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
      preview: true,
      architectureOnly: true,
      intent: "ai_credits",
      ecpayConfigured: isEcpayConfigured(),
      companyId: auth.companyId,
      creditPackId: pack.id,
      paymentMethod,
      error: ECPAY_NOT_IMPLEMENTED,
      redirectUrl: null,
      message:
        "ECPay 付款 API 尚未啟用。完成串接後將導向綠界付款頁並透過 callback 更新 AI 點數。",
    });
  }

  const plan = body.plan?.trim().toLowerCase() ?? "";
  if (!isRecurringPaidPlan(plan)) {
    return NextResponse.json(
      { ok: false, error: "請選擇 Starter、Professional 或 Enterprise 方案" },
      { status: 400 },
    );
  }

  const paymentMethod =
    parsePaymentMethod(body.payment_method) ?? "credit_recurring";
  if (body.payment_method?.trim() && !parsePaymentMethod(body.payment_method)) {
    return NextResponse.json({ ok: false, error: "不支援的付款方式" }, { status: 400 });
  }

  const stub = buildEcpayPeriodCheckoutStub({
    companyId: auth.companyId,
    userId: auth.user.id,
    plan,
    paymentMethod,
  });

  return NextResponse.json({
    ok: false,
    preview: true,
    architectureOnly: true,
    intent: "subscription",
    ecpayConfigured: isEcpayConfigured(),
    companyId: auth.companyId,
    plan,
    paymentMethod,
    error: stub.error ?? ECPAY_NOT_IMPLEMENTED,
    redirectUrl: null,
    message:
      "ECPay 定期定額／付款 API 尚未啟用。完成串接後將導向綠界付款頁並透過 callback 更新訂閱狀態。",
  });
}
