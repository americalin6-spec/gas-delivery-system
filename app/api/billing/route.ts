import { NextResponse } from "next/server";
import { requireApiAuth } from "../../lib/apiAuth";
import { getBillingSettingsSnapshot } from "../../lib/billingSettings";
import { isEcpayConfigured } from "../../lib/ecpayArchitecture";
import { getCompanyAiUsageStatus } from "../../lib/aiUsageServer";
import { getCompanySubscriptionView } from "../../lib/subscriptionServer";
import { AI_CREDIT_PACKS } from "../../lib/subscriptionPlans";
import { isStripeConfigured } from "../../lib/stripeServer";

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

  const stripeConnected = isStripeConfigured();
  const ecpayConfigured = isEcpayConfigured();
  const settings = getBillingSettingsSnapshot({
    stripeConfigured: stripeConnected,
    ecpayConfigured,
  });

  return NextResponse.json({
    ok: true,
    companyId: auth.companyId,
    billing: {
      subscription,
      usage,
      settings,
      creditPacks: AI_CREDIT_PACKS,
      stripeConnected,
      ecpayConfigured,
      primaryProvider: settings.primaryProvider,
      invoices: [] as unknown[],
      paymentMethod: null,
      note: "台灣預設 ECPay 定期定額（架構預留）；Stripe 供國際訂閱。",
    },
  });
}
