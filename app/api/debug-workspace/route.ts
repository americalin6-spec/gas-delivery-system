import { NextResponse } from "next/server";
import { parsePreferredCompanyId, requireApiAuth } from "../../lib/apiAuth";
import { createSupabaseAuthServerClient } from "../../lib/supabaseAuthServer";
import { ensureUserTenantBootstrap } from "../../lib/tenantBootstrapServer";
import {
  listUserCompanies,
  resolveUserActiveCompanyId,
  userHasCompanyAccess,
} from "../../lib/tenantAuth";
import { ensureDefaultWorkspaceForCompany } from "../../lib/workspaceBootstrapServer";
import { getSupabaseServiceRole, isServiceRoleConfigured } from "../../lib/supabaseServer";

type WorkspaceDebugRow = {
  id: number;
  name: string;
  company_id: number;
};

async function listWorkspacesForCompany(
  companyId: number,
): Promise<{ rows: WorkspaceDebugRow[]; error: string | null }> {
  if (!Number.isFinite(companyId) || companyId <= 0) {
    return { rows: [], error: null };
  }

  if (!isServiceRoleConfigured()) {
    return { rows: [], error: "SUPABASE_SERVICE_ROLE_KEY not configured" };
  }

  const admin = getSupabaseServiceRole();
  const { data, error } = await admin
    .from("workspaces")
    .select("id, name, company_id")
    .eq("company_id", companyId)
    .order("id", { ascending: true });

  if (error) {
    if (/does not exist/i.test(error.message) && /relation|table/i.test(error.message)) {
      return { rows: [], error: null };
    }
    return { rows: [], error: error.message };
  }

  return {
    rows: (data ?? []).map((row) => ({
      id: Number(row.id),
      name: String(row.name ?? ""),
      company_id: Number(row.company_id),
    })),
    error: null,
  };
}

/** Resolve active company for debug listing when requireApiAuth fails early. */
async function resolveDebugCompanyId(
  preferredCompanyId?: number,
): Promise<{ companyId: number | null; error: string | null }> {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { companyId: null, error: "請先登入" };
  }

  let resolved = await resolveUserActiveCompanyId(supabase, user.id);
  if (resolved.error) {
    return { companyId: null, error: resolved.error };
  }

  let companyId = resolved.companyId;
  if (!companyId) {
    const boot = await ensureUserTenantBootstrap(user);
    if (boot.error || !boot.companyId) {
      return { companyId: null, error: boot.error ?? "無法建立工作區" };
    }
    companyId = boot.companyId;
  }

  if (preferredCompanyId && preferredCompanyId !== companyId) {
    const canUsePreferred = await userHasCompanyAccess(
      supabase,
      user.id,
      preferredCompanyId,
    );
    if (canUsePreferred) {
      companyId = preferredCompanyId;
    } else {
      return { companyId: null, error: "無法存取此工作區" };
    }
  }

  return { companyId, error: null };
}

/**
 * Temporary production debug — same auth/client path as POST /api/analyze.
 * Optional query: company_id, companyId, workspace_id, workspaceId
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const preferredCompanyId = parsePreferredCompanyId(
    url.searchParams.get("company_id") ?? url.searchParams.get("companyId"),
  );
  const preferredWorkspaceId = parsePreferredCompanyId(
    url.searchParams.get("workspace_id") ?? url.searchParams.get("workspaceId"),
  );

  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        userId: null,
        userEmail: null,
        companies: [],
        activeCompanyId: null,
        workspaces: [],
        defaultWorkspaceCreateSucceeded: false,
        finalWorkspaceId: null,
        error: authError?.message ?? "請先登入",
      },
      { status: 401 },
    );
  }

  const { companies, error: listErr } = await listUserCompanies(supabase);

  let error: string | null = listErr;
  let activeCompanyId: number | null = null;
  let workspaces: WorkspaceDebugRow[] = [];
  let defaultWorkspaceCreateSucceeded = false;
  let finalWorkspaceId: number | null = null;

  const auth = await requireApiAuth(req, {
    preferredCompanyId,
    preferredWorkspaceId,
  });

  if (auth instanceof NextResponse) {
    const failedBody = (await auth.json().catch(() => ({}))) as {
      error?: string;
      ok?: boolean;
    };
    error = error ?? failedBody.error ?? `HTTP ${auth.status}`;

    const partial = await resolveDebugCompanyId(preferredCompanyId);
    activeCompanyId = partial.companyId;
    if (partial.error) {
      error = error ?? partial.error;
    }

    if (activeCompanyId) {
      const listed = await listWorkspacesForCompany(activeCompanyId);
      workspaces = listed.rows;
      if (listed.error) {
        error = error ?? listed.error;
      }

      const ensured = await ensureDefaultWorkspaceForCompany(user, activeCompanyId);
      defaultWorkspaceCreateSucceeded = !ensured.error && ensured.workspaceId > 0;
      if (ensured.error) {
        error = error ?? ensured.error;
      } else if (!finalWorkspaceId) {
        finalWorkspaceId = ensured.workspaceId;
      }
    }

    return NextResponse.json(
      {
        userId: user.id,
        userEmail: user.email ?? null,
        companies,
        activeCompanyId,
        workspaces,
        defaultWorkspaceCreateSucceeded,
        finalWorkspaceId,
        error,
        authHttpStatus: auth.status,
      },
      { status: 200 },
    );
  }

  activeCompanyId = auth.companyId;
  finalWorkspaceId = auth.workspaceId;

  const listed = await listWorkspacesForCompany(activeCompanyId);
  workspaces = listed.rows;
  if (listed.error) {
    error = error ?? listed.error;
  }

  const ensured = await ensureDefaultWorkspaceForCompany(user, activeCompanyId);
  defaultWorkspaceCreateSucceeded = !ensured.error && ensured.workspaceId > 0;
  if (ensured.error) {
    error = error ?? ensured.error;
  }

  return NextResponse.json(
    {
      userId: user.id,
      userEmail: user.email ?? null,
      companies,
      activeCompanyId,
      workspaces,
      defaultWorkspaceCreateSucceeded,
      finalWorkspaceId,
      error,
      authHttpStatus: 200,
    },
    { status: 200 },
  );
}
