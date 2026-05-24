import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "./supabaseConfig";

let browserClient: SupabaseClient | null = null;

/** Browser Supabase client with cookie session (auth). */
export function getSupabaseBrowser(): SupabaseClient {
  if (typeof window === "undefined") {
    return createBrowserClient(resolveSupabaseUrl(), resolveSupabaseAnonKey());
  }
  if (!browserClient) {
    browserClient = createBrowserClient(resolveSupabaseUrl(), resolveSupabaseAnonKey());
  }
  return browserClient;
}
