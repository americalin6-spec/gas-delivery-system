import { NextResponse } from "next/server";

/** GET — temporary ECPay env presence check (booleans only, no secrets). */
export async function GET() {
  return NextResponse.json({
    hasMerchantId: Boolean(process.env.ECPAY_MERCHANT_ID?.trim()),
    hasHashKey: Boolean(process.env.ECPAY_HASH_KEY?.trim()),
    hasHashIv: Boolean(process.env.ECPAY_HASH_IV?.trim()),
    hasReturnUrl: Boolean(process.env.ECPAY_RETURN_URL?.trim()),
    hasClientBackUrl: Boolean(process.env.ECPAY_CLIENT_BACK_URL?.trim()),
  });
}
