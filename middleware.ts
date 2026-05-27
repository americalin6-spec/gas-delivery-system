import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "./app/lib/supabaseConfig";

const LOGIN_PATH = "/login";

/** Pages accessible without a Supabase session. */
const PUBLIC_PAGE_PREFIXES = [
  "/",
  "/login",
  "/signup",
  "/auth/callback",
  "/pricing",
] as const;

/** CRM pages — guests are redirected to /login. */
const PROTECTED_CRM_PREFIXES = [
  "/dashboard",
  "/customers",
  "/pipeline",
  "/workspace",
  "/alerts",
  "/settings",
  "/tasks",
  "/calendar",
] as const;

/** API routes that validate their own secrets (no session). */
const PUBLIC_API_PREFIXES = [
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

function isPublicPage(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path === "/") return true;
  if (!path) return false;
  return PUBLIC_PAGE_PREFIXES.some(
    (prefix) =>
      prefix !== "/" &&
      (path === prefix || path.startsWith(`${prefix}/`)),
  );
}

function isProtectedCrmPage(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (!path) return false;
  return PROTECTED_CRM_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function isPublicApi(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return PUBLIC_API_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const path = normalizePathname(pathname);

  if (path.startsWith("/api/")) {
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }

    let response = NextResponse.next({ request });
    const supabase = createServerClient(
      resolveSupabaseUrl(),
      resolveSupabaseAnonKey(),
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "請先登入" },
        { status: 401 },
      );
    }

    return response;
  }

  if (isPublicPage(pathname)) {
    return NextResponse.next();
  }

  if (isProtectedCrmPage(pathname)) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
      resolveSupabaseUrl(),
      resolveSupabaseAnonKey(),
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = LOGIN_PATH;
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
