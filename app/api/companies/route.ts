import { NextResponse } from "next/server";
import { getSupabaseServer } from "../../lib/supabaseServer";

/**
 * Company directory (tenant root). Browser uses publishable/anon keys whose JWT
 * role may not match Postgres `anon`/`authenticated` in RLS policies — so
 * list/create go through the service-role server client (bypasses RLS).
 *
 * CRM tenant isolation stays on customers/conversations via company_id;
 * this endpoint only manages the global companies table.
 */

export async function GET() {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .order("id", { ascending: true });

  if (error) {
    console.error("[api/companies] GET error:", error.message);
    return NextResponse.json({ ok: false, error: error.message, rows: [] }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request) {
  let body: { name?: unknown } = {};
  try {
    body = (await req.json()) as { name?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase.from("companies").insert({ name }).select("id, name").maybeSingle();

  if (error) {
    console.error("[api/companies] POST error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Insert returned no row" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, company: data });
}
