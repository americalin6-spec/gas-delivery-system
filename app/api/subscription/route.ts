import { NextResponse } from "next/server";
import { requireApiAuth } from "../../lib/apiAuth";
import { getCompanySubscriptionView } from "../../lib/subscriptionServer";
import { PLAN_DEFINITIONS, PAID_PLANS } from "../../lib/subscriptionPlans";

/** GET — current company subscription (Stripe fields included when present). */
export async function GET(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const subscription = await getCompanySubscriptionView(auth.companyId);
  if (!subscription) {
    return NextResponse.json({ ok: false, error: "找不到工作區" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    companyId: auth.companyId,
    subscription,
    catalog: {
      trial: PLAN_DEFINITIONS.trial,
      paid: PAID_PLANS.map((id) => PLAN_DEFINITIONS[id]),
    },
    stripeConnected: subscription.billingReady,
  });
}

/** POST — placeholder for plan changes (Stripe not connected). */
export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: { action?: string; plan?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  return NextResponse.json({
    ok: false,
    preview: true,
    message: "訂閱變更尚未連接 Stripe，請使用 /api/checkout 預覽流程。",
    action: body.action ?? null,
    plan: body.plan ?? null,
    companyId: auth.companyId,
  });
}
