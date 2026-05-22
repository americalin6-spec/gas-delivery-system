import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_URL = "https://cblyiubhqejxlggrxvjo.supabase.co";

const serverClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
};

function resolveSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    DEFAULT_URL
  );
}

function resolveServiceRoleKey(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return key || null;
}

let serviceRoleClient: SupabaseClient | null = null;

/**
 * Server-only Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Bypasses RLS — use only in Route Handlers / server code, never in the browser.
 */
export function createServerClient(): SupabaseClient {
  return getSupabaseServiceRole();
}

/** Same as createServerClient — explicit name for service role access. */
export function getSupabaseServiceRole(): SupabaseClient {
  const url = resolveSupabaseUrl();
  const key = resolveServiceRoleKey();

  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local (Supabase Dashboard → Project Settings → API → service_role). Server routes cannot read line_users or other RLS-protected tables without it.",
    );
  }

  if (!serviceRoleClient) {
    serviceRoleClient = createClient(url, key, serverClientOptions);
  }

  return serviceRoleClient;
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(resolveServiceRoleKey());
}

export type SupabaseServerAuthKind = "service_role" | "missing_service_role";

export function getSupabaseServerAuthKind(): SupabaseServerAuthKind {
  return resolveServiceRoleKey() ? "service_role" : "missing_service_role";
}

/**
 * Legacy server client. Prefers service role; falls back to anon only when
 * service role is unset (may hit RLS). Prefer getSupabaseServiceRole() for CRM data APIs.
 */
export function getSupabaseServer(): SupabaseClient {
  const serviceKey = resolveServiceRoleKey();
  if (serviceKey) {
    return getSupabaseServiceRole();
  }

  const url = resolveSupabaseUrl();
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!anon) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required for server Supabase access.",
    );
  }

  return createClient(url, anon, serverClientOptions);
}
