import { NextResponse } from "next/server";
import { requireApiAuth } from "../../../lib/apiAuth";
import { isRecurringPaidPlan } from "../../../lib/billingSettings";
import {
  buildEcpayPeriodCheckoutStub,
  ECPAY_NOT_IMPLEMENTED,
  isEcpayConfigured,
} from "../../../lib/ecpayArchitecture";

type Body = {
  plan?: string;
  payment_method?: string;
};

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

  const plan = body.plan?.trim().toLowerCase() ?? "";
  if (!isRecurringPaidPlan(plan)) {
    return NextResponse.json(
      { ok: false, error: "請選擇 Starter、Professional 或 Enterprise 方案" },
      { status: 400 },
    );
  }

  const paymentMethod = body.payment_method?.trim() ?? "credit_recurring";
  const allowed = ["credit_recurring", "credit_once", "atm", "cvs"];
  if (!allowed.includes(paymentMethod)) {
    return NextResponse.json({ ok: false, error: "不支援的付款方式" }, { status: 400 });
  }

  const stub = buildEcpayPeriodCheckoutStub({
    companyId: auth.companyId,
    userId: auth.user.id,
    plan,
    paymentMethod: paymentMethod as "credit_recurring" | "credit_once" | "atm" | "cvs",
  });

  return NextResponse.json({
    ok: false,
    preview: true,
    architectureOnly: true,
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
