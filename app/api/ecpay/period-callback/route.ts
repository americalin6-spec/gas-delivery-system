import { NextResponse } from "next/server";
import {
  ECPAY_NOT_IMPLEMENTED,
  handleEcpayPeriodCallbackStub,
} from "../../../lib/ecpayArchitecture";
import { serverLogger } from "../../../lib/serverLogger";

export const runtime = "nodejs";

/**
 * POST — ECPay recurring (Period) payment notification (architecture stub).
 * Future: extend paid_until, keep subscription_status = active on success.
 */
export async function POST(req: Request) {
  let payload: Record<string, string> = {};
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      payload = (await req.json()) as Record<string, string>;
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      params.forEach((v, k) => {
        payload[k] = v;
      });
    }
  } catch {
    serverLogger.warn({
      eventType: "payment.callback",
      status: "warn",
      message: "ecpay_period_callback_parse_failed",
    });
    return NextResponse.json({ ok: false, error: "無法解析回傳資料" }, { status: 400 });
  }

  serverLogger.info({
    eventType: "payment.callback",
    status: "ok",
    message: "ecpay_period_callback_received",
    meta: { fieldCount: Object.keys(payload).length },
  });

  const result = handleEcpayPeriodCallbackStub(payload);
  return NextResponse.json(
    {
      ok: false,
      architectureOnly: true,
      error: result.error ?? ECPAY_NOT_IMPLEMENTED,
      received: Object.keys(payload),
    },
    { status: 501 },
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/ecpay/period-callback",
    note: ECPAY_NOT_IMPLEMENTED,
  });
}
