/**
 * Browser Supabase client (authenticated session via cookies).
 * Use this in client components so RLS applies per logged-in user.
 */
import { getSupabaseBrowser } from "./app/lib/supabaseBrowser";

export const supabase = getSupabaseBrowser();
