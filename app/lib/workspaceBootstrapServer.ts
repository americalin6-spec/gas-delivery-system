import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseServiceRole, isServiceRoleConfigured } from "./supabaseServer";

const DEFAULT_WORKSPACE_NAME = "預設工作區";

export type WorkspaceBootstrapResult = {
  companyId: number;
  workspaceId: number;
  error: string | null;
  created: boolean;
};

function isMissingRelationError(message: string | undefined): boolean {
  if (!message) return false;
  return /does not exist/i.test(message) && /relation|table/i.test(message);
}

function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return /does not exist/i.test(message) || /column/i.test(message);
}

function logWorkspaceBootstrap(companyId: number, workspaceId: number): void {
  console.log("[workspace-bootstrap] companyId", companyId);
  console.log("[workspace-bootstrap] workspaceId", workspaceId);
}

/** Map workspace id → company id when workspaces table exists. */
export async function resolveWorkspaceCompanyId(
  workspaceId: number,
): Promise<{ companyId: number | null; error: string | null }> {
  if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
    return { companyId: null, error: "invalid workspaceId" };
  }

  if (!isServiceRoleConfigured()) {
    return { companyId: workspaceId, error: null };
  }

  const admin = getSupabaseServiceRole();
  const { data, error } = await admin
    .from("workspaces")
    .select("company_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error.message)) {
      return { companyId: workspaceId, error: null };
    }
    return { companyId: null, error: error.message };
  }

  if (!data) {
    return { companyId: null, error: null };
  }

  const companyId = Number((data as { company_id: unknown }).company_id);
  if (!Number.isFinite(companyId) || companyId <= 0) {
    return { companyId: null, error: null };
  }

  return { companyId, error: null };
}

/**
 * Ensures the active company has at least one workspace row.
 * When `public.workspaces` is absent, workspaceId falls back to companyId.
 */
export async function ensureDefaultWorkspaceForCompany(
  user: User,
  companyId: number,
): Promise<WorkspaceBootstrapResult> {
  if (!Number.isFinite(companyId) || companyId <= 0) {
    return { companyId, workspaceId: 0, error: "invalid companyId", created: false };
  }

  if (!isServiceRoleConfigured()) {
    logWorkspaceBootstrap(companyId, companyId);
    return { companyId, workspaceId: companyId, error: null, created: false };
  }

  const admin = getSupabaseServiceRole();

  const companyCheck = await admin
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();

  if (companyCheck.error && !isMissingRelationError(companyCheck.error.message)) {
    return { companyId, workspaceId: 0, error: companyCheck.error.message, created: false };
  }

  if (!companyCheck.data) {
    return { companyId, workspaceId: 0, error: "找不到工作區", created: false };
  }

  const existing = await admin
    .from("workspaces")
    .select("id")
    .eq("company_id", companyId)
    .order("id", { ascending: true })
    .limit(1);

  if (existing.error) {
    if (isMissingRelationError(existing.error.message)) {
      logWorkspaceBootstrap(companyId, companyId);
      return { companyId, workspaceId: companyId, error: null, created: false };
    }
    return { companyId, workspaceId: 0, error: existing.error.message, created: false };
  }

  if (existing.data?.[0]) {
    const workspaceId = Number(existing.data[0].id);
    logWorkspaceBootstrap(companyId, workspaceId);
    return { companyId, workspaceId, error: null, created: false };
  }

  const withOwner = await admin
    .from("workspaces")
    .insert({
      company_id: companyId,
      name: DEFAULT_WORKSPACE_NAME,
      owner_user_id: user.id,
    })
    .select("id")
    .maybeSingle();

  let createdRow = withOwner.data;
  let createError = withOwner.error;

  if (createError && isMissingColumnError(createError.message)) {
    const withoutOwner = await admin
      .from("workspaces")
      .insert({
        company_id: companyId,
        name: DEFAULT_WORKSPACE_NAME,
      })
      .select("id")
      .maybeSingle();
    createdRow = withoutOwner.data;
    createError = withoutOwner.error;
  }

  if (createError) {
    const raced = await admin
      .from("workspaces")
      .select("id")
      .eq("company_id", companyId)
      .order("id", { ascending: true })
      .limit(1);

    if (raced.data?.[0]) {
      const workspaceId = Number(raced.data[0].id);
      logWorkspaceBootstrap(companyId, workspaceId);
      return { companyId, workspaceId, error: null, created: false };
    }

    return { companyId, workspaceId: 0, error: createError.message, created: false };
  }

  const workspaceId = Number(createdRow?.id);
  if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
    return { companyId, workspaceId: 0, error: "無法建立工作區", created: false };
  }

  logWorkspaceBootstrap(companyId, workspaceId);
  return { companyId, workspaceId, error: null, created: true };
}

/**
 * Resolve preferred workspace for API calls; creates default workspace when missing.
 */
export async function resolveWorkspaceContext(
  user: User,
  companyId: number,
  preferredWorkspaceId?: number,
): Promise<WorkspaceBootstrapResult> {
  const ensured = await ensureDefaultWorkspaceForCompany(user, companyId);
  if (ensured.error || ensured.workspaceId <= 0) {
    return ensured;
  }

  if (!preferredWorkspaceId || preferredWorkspaceId === ensured.workspaceId) {
    return ensured;
  }

  const mapped = await resolveWorkspaceCompanyId(preferredWorkspaceId);
  if (mapped.error) {
    return {
      companyId,
      workspaceId: 0,
      error: mapped.error,
      created: false,
    };
  }

  if (!mapped.companyId || mapped.companyId !== companyId) {
    return {
      companyId,
      workspaceId: 0,
      error: "無法存取此工作區",
      created: false,
    };
  }

  logWorkspaceBootstrap(companyId, preferredWorkspaceId);
  return {
    companyId,
    workspaceId: preferredWorkspaceId,
    error: null,
    created: false,
  };
}
