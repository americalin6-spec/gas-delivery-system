import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "./supabaseConfig";

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
