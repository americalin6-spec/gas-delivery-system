import { NextResponse } from "next/server";
import { requireApiAuth } from "../../lib/apiAuth";
import { type CheckoutIntent } from "../../lib/subscriptionPlans";
import { normalizeCheckoutPlan } from "../../lib/subscriptionServer";
import {
  createStripeCheckoutSession,
  isStripeConfigured,
} from "../../lib/stripeServer";

type CheckoutBody = {
  intent?: CheckoutIntent;
  plan?: string;
  credit_pack_id?: string;
};

/** POST — create Stripe Checkout session (subscription or AI credits). */
export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "金流尚未設定，請聯絡管理員設定 STRIPE_SECRET_KEY",
      },
      { status: 503 },
    );
  }

  let body: CheckoutBody = {};
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const intent: CheckoutIntent =
    body.intent === "ai_credits" ? "ai_credits" : "subscription";

  const email = auth.user.email?.trim();
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "請先為帳號設定電子郵件" },
      { status: 400 },
    );
  }

  try {
    if (intent === "subscription") {
      const plan = normalizeCheckoutPlan(body.plan);
      if (!plan) {
        return NextResponse.json(
          { ok: false, error: "請選擇 Starter、Professional 或 Enterprise 方案" },
          { status: 400 },
        );
      }

      const { url, sessionId } = await createStripeCheckoutSession({
        companyId: auth.companyId,
        userId: auth.user.id,
        email,
        intent: "subscription",
        plan,
      });

      return NextResponse.json({
        ok: true,
        intent,
        companyId: auth.companyId,
        plan,
        checkoutUrl: url,
        sessionId,
      });
    }

    const { url, sessionId } = await createStripeCheckoutSession({
      companyId: auth.companyId,
      userId: auth.user.id,
      email,
      intent: "ai_credits",
      creditPackId: body.credit_pack_id?.trim(),
    });

    return NextResponse.json({
      ok: true,
      intent,
      companyId: auth.companyId,
      creditPackId: body.credit_pack_id ?? null,
      checkoutUrl: url,
      sessionId,
    });
  } catch (err) {
    console.error("[api/checkout]", err);
    const message =
      err instanceof Error ? err.message : "無法建立結帳連結，請稍後再試";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
