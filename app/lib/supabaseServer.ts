import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_URL = "https://cblyiubhqejxlggrxvjo.supabase.co";
const DEFAULT_ANON = "sb_publishable_Iiu4tJ3QrNM3feM6pasj6Q_if6dWIKF";

/** Server-side Supabase client (service role when configured). */
export function getSupabaseServer(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? DEFAULT_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    DEFAULT_ANON;
  return createClient(url, key);
}
