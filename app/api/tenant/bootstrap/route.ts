import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "../../../lib/supabaseAuthServer";
import { ensureUserTenantBootstrap } from "../../../lib/tenantBootstrapServer";
import { listUserCompanies, resolveUserActiveCompanyId } from "../../../lib/tenantAuth";

/**
 * POST /api/tenant/bootstrap
 * Ensures the signed-in user has a private owned workspace (server-only).
 */
export async function POST() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, error: "請先登入" },
      { status: 401 },
    );
  }

  let resolved = await resolveUserActiveCompanyId(supabase, user.id);
  let created = false;

  if (!resolved.companyId) {
    const boot = await ensureUserTenantBootstrap(user);
    if (boot.error || !boot.companyId) {
      console.error("[api/tenant/bootstrap]", boot.error);
      return NextResponse.json(
        { ok: false, error: boot.error ?? "無法建立工作區" },
        { status: 500 },
      );
    }
    resolved = { companyId: boot.companyId, error: null };
    created = boot.created;
  }

  const companyId = resolved.companyId!;
  const { companies, error: listErr } = await listUserCompanies(supabase);
  if (listErr) {
    return NextResponse.json({ ok: false, error: listErr }, { status: 500 });
  }

  console.log("[api/tenant/bootstrap] ok:", {
    authUserId: user.id,
    activeCompanyId: companyId,
    created,
  });

  return NextResponse.json({
    ok: true,
    companyId,
    created,
    companies,
  });
}
