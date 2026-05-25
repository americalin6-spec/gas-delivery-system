/** Public routes — no login required. */
export const HOME_PATH = "/";

/** Sign-in page (unauthenticated users are sent here). */
export const LOGIN_PATH = "/login";

/** Authenticated app home (LINE 分析 / 儀表板). */
export const DASHBOARD_PATH = "/dashboard";

export const PRICING_PATH = "/pricing";

export const PUBLIC_PATH_PREFIXES = [
  HOME_PATH,
  LOGIN_PATH,
  "/signup",
  "/auth/callback",
  PRICING_PATH,
] as const;

/** CRM app routes — login required (middleware + AuthGate). */
export const PROTECTED_CRM_PATH_PREFIXES = [
  "/dashboard",
  "/customers",
  "/pipeline",
  "/workspace",
  "/settings",
  "/tasks",
  "/calendar",
] as const;

/** Webhooks / cron — no Supabase session (each route validates its own secret). */
export const PUBLIC_API_PATH_PREFIXES = [
  "/api/line-webhook",
  "/api/reminder-check",
  "/api/stripe/webhook",
  "/api/ecpay/callback",
  "/api/ecpay/period-callback",
] as const;

function normalizePathname(pathname: string): string {
  const path = (pathname ?? "").trim();
  if (!path) return "";
  const withoutQuery = path.split("?")[0] ?? path;
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

export function isPublicPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path === HOME_PATH) return true;
  if (!path) return false;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) =>
      prefix !== HOME_PATH &&
      (path === prefix || path.startsWith(`${prefix}/`)),
  );
}

export function isPublicApiPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return PUBLIC_API_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isProtectedCrmPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (!path) return false;
  return PROTECTED_CRM_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** @alias isProtectedCrmPath — used by AuthGate and client guards. */
export function isProtectedPath(pathname: string): boolean {
  return isProtectedCrmPath(pathname);
}

/** Safe in-app redirect target after login (?next=). */
export function resolvePostLoginPath(
  next: string | null | undefined,
  fallback: string = DASHBOARD_PATH,
): string {
  const raw = (next ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (isPublicPath(raw) && raw !== DASHBOARD_PATH) return fallback;
  return raw;
}
