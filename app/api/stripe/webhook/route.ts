import { NextResponse } from "next/server";
import { dispatchStripeWebhookEvent } from "../../../lib/stripeWebhookHandlers";
import { getStripe, isStripeConfigured } from "../../../lib/stripeServer";

export const runtime = "nodejs";

/** Stripe webhook — verifies signature and updates company subscription / credits. */
export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, error: "Stripe 未設定" }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET missing");
    return NextResponse.json({ ok: false, error: "Webhook 未設定" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "缺少簽章" }, { status: 400 });
  }

  const body = await req.text();

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "簽章驗證失敗";
    console.error("[stripe/webhook] verify failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  try {
    await dispatchStripeWebhookEvent(event);
  } catch (err) {
    console.error("[stripe/webhook] handler error:", err);
    return NextResponse.json(
      { ok: false, error: "Webhook 處理失敗" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, received: true, type: event.type });
}
