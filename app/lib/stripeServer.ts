import "server-only";

import Stripe from "stripe";
import {
  getCreditPackById,
  monthlyAiLimitForPlan,
  type SubscriptionPlan,
} from "./subscriptionPlans";
import { getSupabaseServiceRole } from "./supabaseServer";
import { loadCompanySubscriptionRow } from "./subscriptionServer";
import { serverLogger } from "./serverLogger";

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY 未設定");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export function getAppBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;

  return "http://localhost:3000";
}

function envPriceId(name: string): string | null {
  const id = process.env[name]?.trim();
  return id && id.startsWith("price_") ? id : null;
}

export function getSubscriptionPriceId(plan: SubscriptionPlan): string | null {
  switch (plan) {
    case "starter":
      return envPriceId("STRIPE_PRICE_STARTER");
    case "professional":
      return envPriceId("STRIPE_PRICE_PROFESSIONAL");
    case "enterprise":
      return envPriceId("STRIPE_PRICE_ENTERPRISE");
    default:
      return null;
  }
}

export function getCreditPackPriceId(packId: string): string | null {
  switch (packId) {
    case "credits_100":
      return envPriceId("STRIPE_PRICE_CREDITS_100");
    case "credits_500":
      return envPriceId("STRIPE_PRICE_CREDITS_500");
    default:
      return null;
  }
}

export async function getOrCreateStripeCustomer(params: {
  companyId: number;
  email: string;
  name?: string | null;
}): Promise<string> {
  const row = await loadCompanySubscriptionRow(params.companyId);
  if (row?.stripe_customer_id) {
    return row.stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: params.email,
    name: params.name?.trim() || undefined,
    metadata: {
      company_id: String(params.companyId),
    },
  });

  const admin = getSupabaseServiceRole();
  await admin
    .from("companies")
    .update({ stripe_customer_id: customer.id })
    .eq("id", params.companyId);

  return customer.id;
}

export type CreateCheckoutSessionParams = {
  companyId: number;
  userId: string;
  email: string;
  intent: "subscription" | "ai_credits";
  plan?: SubscriptionPlan;
  creditPackId?: string;
};

export async function createStripeCheckoutSession(
  params: CreateCheckoutSessionParams,
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();
  const customerId = await getOrCreateStripeCustomer({
    companyId: params.companyId,
    email: params.email,
  });

  const successUrl = `${baseUrl}/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/pricing?billing=canceled`;

  if (params.intent === "subscription") {
    const plan = params.plan;
    if (!plan || plan === "trial") {
      throw new Error("無效的訂閱方案");
    }

    const priceId = getSubscriptionPriceId(plan);
    if (!priceId) {
      throw new Error(
        `方案 ${plan} 尚未設定 Stripe 價格（請設定 STRIPE_PRICE_${plan.toUpperCase()}）`,
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      payment_method_types: ["card"],
      metadata: {
        company_id: String(params.companyId),
        user_id: params.userId,
        intent: "subscription",
        plan,
      },
      subscription_data: {
        metadata: {
          company_id: String(params.companyId),
          plan,
        },
      },
    });

    if (!session.url) {
      throw new Error("無法建立 Stripe 結帳連結");
    }

    return { url: session.url, sessionId: session.id };
  }

  const pack = getCreditPackById(params.creditPackId ?? "");
  if (!pack) {
    throw new Error("請選擇有效的 AI 點數方案");
  }

  const priceId = getCreditPackPriceId(pack.id);
  if (!priceId) {
    throw new Error(
      `AI 點數方案尚未設定 Stripe 價格（請設定環境變數 STRIPE_PRICE_${pack.id === "credits_100" ? "CREDITS_100" : "CREDITS_500"}）`,
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: ["card"],
    metadata: {
      company_id: String(params.companyId),
      user_id: params.userId,
      intent: "ai_credits",
      credit_pack_id: pack.id,
      credits: String(pack.credits),
    },
  });

  if (!session.url) {
    throw new Error("無法建立 Stripe 結帳連結");
  }

  return { url: session.url, sessionId: session.id };
}

export async function createStripeBillingPortalSession(params: {
  companyId: number;
  email: string;
}): Promise<string> {
  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();
  const customerId = await getOrCreateStripeCustomer({
    companyId: params.companyId,
    email: params.email,
  });

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/settings`,
  });

  if (!session.url) {
    throw new Error("無法開啟 Stripe 訂閱管理");
  }

  return session.url;
}

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "inactive";
  }
}

export async function syncSubscriptionFromStripe(
  companyId: number,
  subscription: Stripe.Subscription,
): Promise<void> {
  const plan =
    (subscription.metadata?.plan as SubscriptionPlan | undefined) ??
    (subscription.items.data[0]?.price.metadata?.plan as SubscriptionPlan | undefined);

  const validPlan =
    plan === "starter" || plan === "professional" || plan === "enterprise"
      ? plan
      : "starter";

  const paidUntil = new Date(subscription.current_period_end * 1000).toISOString();
  const status = mapStripeSubscriptionStatus(subscription.status);
  const limit = monthlyAiLimitForPlan(validPlan);

  const admin = getSupabaseServiceRole();
  const { error } = await admin
    .from("companies")
    .update({
      subscription_plan: validPlan,
      subscription_status: status,
      stripe_subscription_id: subscription.id,
      stripe_customer_id:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? null,
      paid_until: paidUntil,
      plan_status: status === "active" || status === "trialing" ? "paid" : "trial",
      ai_monthly_limit: limit,
    })
    .eq("id", companyId);

  if (error) {
    console.error("[stripe] sync subscription failed:", error.message);
    throw new Error(error.message);
  }

  serverLogger.info({
    eventType: "subscription.changed",
    status: "ok",
    companyId,
    message: "stripe_subscription_synced",
    meta: { plan: validPlan, subscriptionStatus: status },
  });
}

export async function addCompanyAiExtraCredits(
  companyId: number,
  credits: number,
): Promise<void> {
  const amount = Math.max(0, Math.floor(credits));
  if (amount <= 0) return;

  const row = await loadCompanySubscriptionRow(companyId);
  if (!row) {
    throw new Error("找不到工作區");
  }

  const next = (row.ai_extra_credits ?? 0) + amount;
  const admin = getSupabaseServiceRole();
  const { error } = await admin
    .from("companies")
    .update({ ai_extra_credits: next })
    .eq("id", companyId);

  if (error) {
    throw new Error(error.message);
  }

  console.log("[stripe] ai_extra_credits updated:", { companyId, added: amount, total: next });
}
