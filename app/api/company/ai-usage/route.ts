import { NextResponse } from "next/server";
import { requireApiAuth } from "../../../lib/apiAuth";
import { getCompanyAiUsageStatus } from "../../../lib/aiUsageServer";

/** GET — plan status and monthly AI usage for the active company. */
export async function GET(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const usage = await getCompanyAiUsageStatus(auth.companyId);
  if (!usage) {
    return NextResponse.json({ ok: false, error: "找不到工作區" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    companyId: auth.companyId,
    usage,
  });
}
