import { NextResponse } from "next/server";

/** GET — lightweight health check for uptime monitors. */
export async function GET() {
  const environment =
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "development";

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment,
  });
}
