import { NextResponse } from "next/server";
import { requireApiAuth } from "../../lib/apiAuth";
import { getCompanyAiUsageStatus } from "../../lib/aiUsageServer";
import { getCompanySubscriptionView } from "../../lib/subscriptionServer";
import { AI_CREDIT_PACKS } from "../../lib/subscriptionPlans";

/** GET — billing summary placeholder for account / settings UI. */
export async function GET(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const [subscription, usage] = await Promise.all([
    getCompanySubscriptionView(auth.companyId),
    getCompanyAiUsageStatus(auth.companyId),
  ]);

  if (!subscription) {
    return NextResponse.json({ ok: false, error: "找不到工作區" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    companyId: auth.companyId,
    billing: {
      subscription,
      usage,
      creditPacks: AI_CREDIT_PACKS,
      stripeConnected: subscription.billingReady,
      invoices: [] as unknown[],
      paymentMethod: null,
      note: "Stripe 金流尚未啟用，此為預覽資料結構。",
    },
  });
}
