import { NextResponse } from "next/server";
import { requireApiAuth } from "../../lib/apiAuth";

/** Disabled while isolating homepage save bug — use homepage saveToCrm() only. */
export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  return NextResponse.json(
    {
      success: false,
      error: "Customer writes disabled on /api/save. Use homepage Save to CRM only.",
    },
    { status: 403 },
  );
}
