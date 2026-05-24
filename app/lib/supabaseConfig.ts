/** Shared Supabase project URL and anon/publishable key for browser + auth routes. */
const DEFAULT_URL = "https://cblyiubhqejxlggrxvjo.supabase.co";
const DEFAULT_ANON =
  "sb_publishable_Iiu4tJ3QrNM3feM6pasj6Q_if6dWIKF";

export function resolveSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    DEFAULT_URL
  );
}

export function resolveSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    DEFAULT_ANON
  );
}

export const AUTH_CALLBACK_PATH = "/auth/callback";
export { DASHBOARD_PATH, HOME_PATH, LOGIN_PATH } from "./authRoutes";
