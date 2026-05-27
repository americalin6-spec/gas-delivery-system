import { NextResponse } from "next/server";

/**
 * Internal operational APIs (debug/tools) must be explicitly enabled.
 * Default-off in production to avoid accidental exposure.
 */
export function requireInternalApiEnabled(): NextResponse | null {
  if (process.env.INTERNAL_API_ENABLED === "1") return null;
  return NextResponse.json({ ok: false, error: "Not Found" }, { status: 404 });
}

