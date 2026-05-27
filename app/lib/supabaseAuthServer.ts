import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "./supabaseConfig";

type PendingAuthCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

/**
 * Route handlers that return redirects/HTML must attach Supabase session cookies
 * to the same NextResponse (cookieStore.set alone is not always sent on redirect).
 */
export function createSupabaseAuthRouteClient(request: NextRequest): {
  supabase: SupabaseClient;
  withAuthCookies: (response: NextResponse) => NextResponse;
  pendingCookieNames: () => string[];
} {
  const pending: PendingAuthCookie[] = [];

  const supabase = createServerClient(resolveSupabaseUrl(), resolveSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          pending.push({ name, value, options: options ?? {} });
        });
      },
    },
  });

  return {
    supabase,
    withAuthCookies(response: NextResponse) {
      for (const { name, value, options } of pending) {
        if (value) {
          response.cookies.set(name, value, options);
        } else {
          response.cookies.delete(name);
        }
      }
      return response;
    },
    pendingCookieNames: () => pending.map((c) => c.name),
  };
}

/** Route Handler / Server Component Supabase client with auth cookies. */
export async function createSupabaseAuthServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(resolveSupabaseUrl(), resolveSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* setAll may fail in Server Components — cookies are set in Route Handlers */
        }
      },
    },
  });
}
