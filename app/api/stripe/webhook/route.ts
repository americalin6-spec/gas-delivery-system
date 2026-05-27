import { NextResponse } from "next/server";
import { dispatchStripeWebhookEvent } from "../../../lib/stripeWebhookHandlers";
import { getStripe, isStripeConfigured } from "../../../lib/stripeServer";
import { serverLogger } from "../../../lib/serverLogger";

export const runtime = "nodejs";

/** Stripe webhook — verifies signature and updates company subscription / credits. */
export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, error: "Stripe 未設定" }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    serverLogger.error({
      eventType: "webhook.failure",
      status: "error",
      message: "STRIPE_WEBHOOK_SECRET missing",
    });
    return NextResponse.json({ ok: false, error: "Webhook 未設定" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    serverLogger.warn({
      eventType: "webhook.failure",
      status: "warn",
      message: "missing_stripe_signature",
    });
    return NextResponse.json({ ok: false, error: "缺少簽章" }, { status: 400 });
  }

  const body = await req.text();

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "簽章驗證失敗";
    serverLogger.error(
      {
        eventType: "webhook.failure",
        status: "error",
        message,
      },
      err,
    );
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  serverLogger.info({
    eventType: "payment.callback",
    status: "ok",
    message: "stripe_webhook_received",
    meta: { eventType: event.type },
  });

  try {
    await dispatchStripeWebhookEvent(event);
  } catch (err) {
    serverLogger.error(
      {
        eventType: "webhook.failure",
        status: "error",
        message: "stripe_webhook_handler_failed",
        meta: { eventType: event.type },
      },
      err,
    );
    return NextResponse.json(
      { ok: false, error: "Webhook 處理失敗" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, received: true, type: event.type });
}
