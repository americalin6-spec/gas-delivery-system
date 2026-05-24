import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAuthServerClient } from "./supabaseAuthServer";
import { ensureUserTenantBootstrap } from "./tenantBootstrapServer";
import { resolveUserActiveCompanyId } from "./tenantAuth";

export type ApiAuthContext = {
  supabase: SupabaseClient;
  user: User;
  companyId: number;
};

/**
 * CRM API auth: session required; active company from owned workspace only.
 * Never reads x-company-id, localStorage, or DEFAULT_COMPANY_ID.
 */
export async function requireApiAuth(
  _req: Request,
): Promise<ApiAuthContext | NextResponse> {
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
  if (resolved.error) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: 500 },
    );
  }

  let companyId = resolved.companyId;

  if (!companyId) {
    const boot = await ensureUserTenantBootstrap(user);
    if (boot.error || !boot.companyId) {
      return NextResponse.json(
        { ok: false, error: boot.error ?? "無法建立工作區" },
        { status: 403 },
      );
    }
    companyId = boot.companyId;
    resolved = { companyId, error: null };
  }

  return { supabase, user, companyId };
}

export function isApiAuthError(
  result: ApiAuthContext | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
