/** Public routes — no login required. */
export const HOME_PATH = "/";

/** Authenticated app home (LINE 分析 / 儀表板). */
export const DASHBOARD_PATH = "/dashboard";

export const PUBLIC_PATH_PREFIXES = [
  HOME_PATH,
  "/login",
  "/signup",
  "/auth/callback",
] as const;

export function isPublicPath(pathname: string): boolean {
  if (!pathname) return true;
  if (pathname === HOME_PATH) return true;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => prefix !== HOME_PATH && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

export function isProtectedPath(pathname: string): boolean {
  return !isPublicPath(pathname);
}
