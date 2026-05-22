import { NextResponse } from "next/server";

/** Disabled while isolating homepage save bug — use homepage saveToCrm() only. */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Customer writes disabled on /api/save. Use homepage Save to CRM only.",
    },
    { status: 403 },
  );
}
