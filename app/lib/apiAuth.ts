import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAuthServerClient } from "./supabaseAuthServer";
import { ensureUserTenantBootstrap } from "./tenantBootstrapServer";
import { resolveUserActiveCompanyId, userHasCompanyAccess } from "./tenantAuth";
import { resolveWorkspaceContext } from "./workspaceBootstrapServer";

export type ApiAuthContext = {
  supabase: SupabaseClient;
  user: User;
  companyId: number;
  workspaceId: number;
};

export type RequireApiAuthOptions = {
  /** Client active company — validated against membership before use. */
  preferredCompanyId?: number;
  /** Client active workspace — must belong to resolved company. */
  preferredWorkspaceId?: number;
};

export function parsePreferredCompanyId(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
    return n;
  }
  return undefined;
}

/**
 * CRM API auth: session required; active company from owned workspace only.
 * Never reads x-company-id, localStorage, or DEFAULT_COMPANY_ID.
 */
export async function requireApiAuth(
  _req: Request,
  opts?: RequireApiAuthOptions,
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

  const preferred = opts?.preferredCompanyId;
  if (preferred && preferred !== companyId) {
    const canUsePreferred = await userHasCompanyAccess(supabase, user.id, preferred);
    if (canUsePreferred) {
      companyId = preferred;
    } else {
      return NextResponse.json(
        { ok: false, error: "無法存取此工作區" },
        { status: 403 },
      );
    }
  }

  const workspace = await resolveWorkspaceContext(
    user,
    companyId,
    opts?.preferredWorkspaceId,
  );
  if (workspace.error || workspace.workspaceId <= 0) {
    return NextResponse.json(
      { ok: false, error: workspace.error ?? "找不到工作區" },
      { status: 404 },
    );
  }

  return {
    supabase,
    user,
    companyId: workspace.companyId,
    workspaceId: workspace.workspaceId,
  };
}

export function isApiAuthError(
  result: ApiAuthContext | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}
