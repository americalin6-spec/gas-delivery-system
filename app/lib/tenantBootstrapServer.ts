import "server-only";

import type { User } from "@supabase/supabase-js";
import { buildNewCompanyPlanFields } from "./aiUsageServer";
import {
  getSupabaseServiceRole,
  isServiceRoleConfigured,
} from "./supabaseServer";

export type TenantBootstrapResult = {
  companyId: number;
  error: string | null;
  created: boolean;
};

export function defaultCompanyName(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full =
    (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta?.name === "string" && meta.name.trim()) ||
    "";
  if (full) return `${full} 的工作區`;
  const email = user.email?.split("@")[0]?.trim();
  if (email) return `${email} 的工作區`;
  return "我的工作區";
}

/** Owned workspace only — never reuse shared/demo memberships (e.g. company_id 1 guest). */
async function resolveOwnedCompanyIdForUser(
  userId: string,
): Promise<{ companyId: number; error: string | null }> {
  const admin = getSupabaseServiceRole();

  const { data: owned, error: ownedErr } = await admin
    .from("companies")
    .select("id")
    .eq("owner_user_id", userId)
    .order("id", { ascending: true })
    .limit(1);

  if (ownedErr) {
    return { companyId: 0, error: ownedErr.message };
  }

  if (owned?.[0]) {
    const companyId = Number(owned[0].id);
    if (Number.isFinite(companyId) && companyId > 0) {
      console.log("[tenantBootstrap] existing company found:", {
        authUserId: userId,
        companyId,
      });
      return { companyId, error: null };
    }
  }

  const { data: ownerMemberships, error: memErr } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .order("company_id", { ascending: true })
    .limit(1);

  if (memErr) {
    return { companyId: 0, error: memErr.message };
  }

  const row = ownerMemberships?.[0];
  if (!row) {
    return { companyId: 0, error: null };
  }

  const companyId = Number((row as { company_id: unknown }).company_id);
  if (!Number.isFinite(companyId) || companyId <= 0) {
    return { companyId: 0, error: null };
  }

  console.log("[tenantBootstrap] existing owner membership found:", {
    authUserId: userId,
    companyId,
  });
  return { companyId, error: null };
}

async function ensureOwnerMembership(
  userId: string,
  companyId: number,
): Promise<{ error: string | null }> {
  const admin = getSupabaseServiceRole();

  const { data: existing, error: existingErr } = await admin
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingErr) {
    return { error: existingErr.message };
  }

  if (existing) {
    console.log("[tenantBootstrap] existing owner membership found:", {
      authUserId: userId,
      companyId,
      role: String((existing as { role?: unknown }).role ?? ""),
    });
  }

  const { error } = await admin.from("company_members").upsert(
    {
      company_id: companyId,
      user_id: userId,
      role: "owner",
    },
    { onConflict: "company_id,user_id" },
  );

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

async function linkOwnedCompanyIfOrphan(
  user: User,
): Promise<{ companyId: number; error: string | null }> {
  const admin = getSupabaseServiceRole();
  const { data: owned, error: ownedErr } = await admin
    .from("companies")
    .select("id")
    .eq("owner_user_id", user.id)
    .order("id", { ascending: true })
    .limit(1);

  if (ownedErr) {
    return { companyId: 0, error: ownedErr.message };
  }

  const row = owned?.[0];
  if (!row) {
    return { companyId: 0, error: null };
  }

  const companyId = Number(row.id);
  const ensured = await ensureOwnerMembership(user.id, companyId);
  if (ensured.error) {
    return { companyId: 0, error: ensured.error };
  }

  console.log("[tenantBootstrap] existing company found:", {
    authUserId: user.id,
    companyId,
    source: "owner_user_id",
  });
  return { companyId, error: null };
}

/**
 * Idempotent tenant bootstrap (service role). Creates a private owned workspace
 * when the user has no owned company yet.
 */
export async function ensureUserTenantBootstrap(
  user: User,
): Promise<TenantBootstrapResult> {
  if (!isServiceRoleConfigured()) {
    return {
      companyId: 0,
      error:
        "伺服器未設定 SUPABASE_SERVICE_ROLE_KEY，無法建立工作區",
      created: false,
    };
  }

  const existing = await resolveOwnedCompanyIdForUser(user.id);
  if (existing.error) {
    return { companyId: 0, error: existing.error, created: false };
  }
  if (existing.companyId > 0) {
    return { companyId: existing.companyId, error: null, created: false };
  }

  const repaired = await linkOwnedCompanyIfOrphan(user);
  if (repaired.error) {
    return { companyId: 0, error: repaired.error, created: false };
  }
  if (repaired.companyId > 0) {
    return { companyId: repaired.companyId, error: null, created: false };
  }

  const admin = getSupabaseServiceRole();
  const name = defaultCompanyName(user);
  console.log("[tenantBootstrap] creating new company:", {
    authUserId: user.id,
    name,
  });

  const { data: company, error: companyErr } = await admin
    .from("companies")
    .insert({
      name,
      owner_user_id: user.id,
      ...buildNewCompanyPlanFields(),
    })
    .select("id")
    .maybeSingle();

  if (companyErr || !company) {
    const raced = await resolveOwnedCompanyIdForUser(user.id);
    if (raced.companyId > 0) {
      return { companyId: raced.companyId, error: null, created: false };
    }
    return {
      companyId: 0,
      error: companyErr?.message ?? "無法建立工作區",
      created: false,
    };
  }

  const companyId = Number(company.id);
  const ensured = await ensureOwnerMembership(user.id, companyId);
  if (ensured.error) {
    const raced = await resolveOwnedCompanyIdForUser(user.id);
    if (raced.companyId > 0) {
      return { companyId: raced.companyId, error: null, created: false };
    }
    return { companyId: 0, error: ensured.error, created: false };
  }

  return { companyId, error: null, created: true };
}

/** Create an additional owned company for a user (service role). */
export async function createCompanyForUser(
  user: User,
  name: string,
): Promise<{ company: { id: number; name: string } | null; error: string | null }> {
  if (!isServiceRoleConfigured()) {
    return {
      company: null,
      error:
        "伺服器未設定 SUPABASE_SERVICE_ROLE_KEY，無法建立工作區",
    };
  }

  const admin = getSupabaseServiceRole();
  const { data: company, error: companyErr } = await admin
    .from("companies")
    .insert({
      name,
      owner_user_id: user.id,
      ...buildNewCompanyPlanFields(),
    })
    .select("id, name")
    .maybeSingle();

  if (companyErr || !company) {
    return {
      company: null,
      error: companyErr?.message ?? "Insert failed",
    };
  }

  const companyId = Number(company.id);
  const ensured = await ensureOwnerMembership(user.id, companyId);
  if (ensured.error) {
    return { company: null, error: ensured.error };
  }

  return {
    company: { id: companyId, name: String(company.name ?? name) },
    error: null,
  };
}
