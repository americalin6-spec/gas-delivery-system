import { NextResponse } from "next/server";
import { requireApiAuth } from "../../lib/apiAuth";
import { listUserCompanies } from "../../lib/tenantAuth";
import { createCompanyForUser } from "../../lib/tenantBootstrapServer";

/**
 * Company directory for the signed-in user only (RLS + membership).
 */
export async function GET(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { supabase, companyId, user } = auth;
  const { companies, error } = await listUserCompanies(supabase);

  if (error) {
    console.error("[api/companies] GET error:", error);
    return NextResponse.json({ ok: false, error, rows: [] }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    rows: companies,
    activeCompanyId: companyId,
  });
}

export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

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

  const { user } = auth;

  const { company, error } = await createCompanyForUser(user, name);
  if (error || !company) {
    console.error("[api/companies] POST error:", error);
    return NextResponse.json(
      { ok: false, error: error ?? "Insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, company });
}
