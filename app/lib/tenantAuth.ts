import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export type CompanyRow = { id: number; name: string };

/**
 * Active tenant for SaaS: only companies this user owns (not shared legacy memberships).
 * Uses the authenticated Supabase client (RLS applies).
 */
export async function resolveUserActiveCompanyId(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ companyId: number | null; error: string | null }> {
  const { data: owned, error: ownedErr } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_user_id", userId)
    .order("id", { ascending: true })
    .limit(1);

  if (ownedErr) {
    return { companyId: null, error: ownedErr.message };
  }

  if (owned?.[0]) {
    const companyId = Number(owned[0].id);
    if (Number.isFinite(companyId) && companyId > 0) {
      return { companyId, error: null };
    }
  }

  const { data: ownerMemberships, error: memErr } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .order("company_id", { ascending: true })
    .limit(1);

  if (memErr) {
    return { companyId: null, error: memErr.message };
  }

  const row = ownerMemberships?.[0];
  if (!row) {
    return { companyId: null, error: null };
  }

  const companyId = Number((row as { company_id: unknown }).company_id);
  if (!Number.isFinite(companyId) || companyId <= 0) {
    return { companyId: null, error: null };
  }

  return { companyId, error: null };
}

/** List companies the user belongs to (RLS-scoped). */
export async function listUserCompanies(
  supabase: SupabaseClient,
): Promise<{ companies: CompanyRow[]; error: string | null }> {
  const { data: memberships, error: memErr } = await supabase
    .from("company_members")
    .select("company_id");

  if (memErr) {
    return { companies: [], error: memErr.message };
  }

  const ids = (memberships ?? [])
    .map((r) => Number((r as { company_id: unknown }).company_id))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (ids.length === 0) {
    return { companies: [], error: null };
  }

  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .in("id", ids)
    .order("id", { ascending: true });

  if (error) {
    return { companies: [], error: error.message };
  }

  return {
    companies: (data ?? []).map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ""),
    })),
    error: null,
  };
}

/** True when user is a member of the company (explicit user_id + company_id). */
export async function userHasCompanyAccess(
  supabase: SupabaseClient,
  userId: string,
  companyId: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("[tenantAuth] userHasCompanyAccess:", error.message);
    return false;
  }
  return Boolean(data);
}
