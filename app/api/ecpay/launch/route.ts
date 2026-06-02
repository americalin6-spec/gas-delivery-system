import { NextResponse } from "next/server";
import {
  buildEcpayLaunchHtml,
  verifyEcpayLaunchToken,
} from "../../../lib/ecpayServer";

export const runtime = "nodejs";

/** GET — auto-post HTML form to ECPay (signed launch token from checkout). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "缺少付款 token" }, { status: 400 });
  }

  const payload = verifyEcpayLaunchToken(token);
  if (!payload) {
    return NextResponse.json(
      { ok: false, error: "付款連結已失效，請重新升級" },
      { status: 400 },
    );
  }

  return new NextResponse(buildEcpayLaunchHtml(payload), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
