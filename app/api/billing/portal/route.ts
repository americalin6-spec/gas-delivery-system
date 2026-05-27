import { NextResponse } from "next/server";
import { requireApiAuth } from "../../../lib/apiAuth";
import {
  createStripeBillingPortalSession,
  isStripeConfigured,
} from "../../../lib/stripeServer";

/** POST — Stripe Customer Portal for managing subscription (payment UX only). */
export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "金流尚未設定，請使用「升級方案」或聯絡客服。",
      },
      { status: 503 },
    );
  }

  const email = auth.user.email?.trim();
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "請先為帳號設定電子郵件" },
      { status: 400 },
    );
  }

  try {
    const url = await createStripeBillingPortalSession({
      companyId: auth.companyId,
      email,
    });
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "無法開啟訂閱管理";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
