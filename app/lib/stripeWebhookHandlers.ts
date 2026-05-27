import "server-only";

import type Stripe from "stripe";
import {
  addCompanyAiExtraCredits,
  getStripe,
  mapStripeSubscriptionStatus,
  syncSubscriptionFromStripe,
} from "./stripeServer";
import { getSupabaseServiceRole } from "./supabaseServer";
import { serverLogger } from "./serverLogger";
function companyIdFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
): number | null {
  const raw = metadata?.company_id?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const companyId = companyIdFromMetadata(session.metadata);
  if (!companyId) {
    console.warn("[stripe/webhook] checkout.session.completed missing company_id");
    return;
  }

  const intent = session.metadata?.intent;

  if (intent === "ai_credits") {
    const credits = Number(session.metadata?.credits ?? 0);
    await addCompanyAiExtraCredits(companyId, credits);
    return;
  }

  if (intent !== "subscription") return;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    console.warn("[stripe/webhook] subscription checkout without subscription id");
    return;
  }

  const stripe = getStripe();
  let subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const planFromSession = session.metadata?.plan;
  if (
    planFromSession &&
    (planFromSession === "starter" ||
      planFromSession === "professional" ||
      planFromSession === "enterprise") &&
    !subscription.metadata?.plan
  ) {
    subscription = await stripe.subscriptions.update(subscriptionId, {
      metadata: {
        ...subscription.metadata,
        company_id: String(companyId),
        plan: planFromSession,
      },
    });
  }

  await syncSubscriptionFromStripe(companyId, subscription);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const companyId =
    companyIdFromMetadata(subscription.metadata) ??
    (await findCompanyIdByStripeSubscription(subscription.id));

  if (!companyId) {
    console.warn("[stripe/webhook] subscription.updated unknown company", subscription.id);
    return;
  }

  await syncSubscriptionFromStripe(companyId, subscription);
  serverLogger.info({
    eventType: "subscription.changed",
    status: "ok",
    companyId,
    message: "stripe_subscription_updated",
    meta: { subscriptionId: subscription.id },
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const companyId =
    companyIdFromMetadata(subscription.metadata) ??
    (await findCompanyIdByStripeSubscription(subscription.id));

  if (!companyId) return;

  const admin = getSupabaseServiceRole();
  await admin
    .from("companies")
    .update({
      subscription_status: "canceled",
      subscription_plan: "trial",
      stripe_subscription_id: null,
      paid_until: null,
      plan_status: "trial",
    })
    .eq("id", companyId);

  serverLogger.info({
    eventType: "subscription.changed",
    status: "ok",
    companyId,
    message: "stripe_subscription_deleted",
    meta: { subscriptionId: subscription.id },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!subscriptionId) return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const companyId =
    companyIdFromMetadata(subscription.metadata) ??
    (await findCompanyIdByStripeSubscription(subscriptionId));

  if (!companyId) return;

  const paidUntil = new Date(subscription.current_period_end * 1000).toISOString();
  const status = mapStripeSubscriptionStatus(subscription.status);

  const admin = getSupabaseServiceRole();
  await admin
    .from("companies")
    .update({
      paid_until: paidUntil,
      subscription_status: status,
    })
    .eq("id", companyId);

  serverLogger.info({
    eventType: "payment.callback",
    status: "ok",
    companyId,
    message: "stripe_invoice_paid",
    meta: { subscriptionId },
  });
}

async function findCompanyIdByStripeSubscription(
  subscriptionId: string,
): Promise<number | null> {
  const admin = getSupabaseServiceRole();
  const { data } = await admin
    .from("companies")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!data) return null;
  const n = Number(data.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function dispatchStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    default:
      break;
  }
}
