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

/** sessionStorage key: origin that started OAuth (localhost vs production). */
export const OAUTH_RETURN_ORIGIN_KEY = "line_work_oauth_return_origin";

/** sessionStorage key: OAuth flow in progress (enables cross-origin postMessage). */
export const OAUTH_PENDING_KEY = "line_work_oauth_pending";

/**
 * OAuth / callback origin for the current browser tab only.
 * Never uses NEXT_PUBLIC_APP_URL or a hardcoded production host in the client.
 */
export function resolveOAuthRedirectOrigin(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const origin = window.location.origin?.trim();
  return origin && origin !== "null" ? origin : "";
}

/**
 * Server-side callback redirect origin from the incoming request (Host / forwarded headers).
 */
export function resolveRequestOrigin(request: Request): string {
  try {
    const url = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host")?.trim();
    if (host) {
      const proto =
        request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
      return `${proto}://${host}`;
    }
    return url.origin;
  } catch {
    return "";
  }
}

export { DASHBOARD_PATH, HOME_PATH, LOGIN_PATH } from "./authRoutes";
