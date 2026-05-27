import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUTH_CALLBACK_PATH,
  OAUTH_PENDING_KEY,
  OAUTH_RETURN_ORIGIN_KEY,
  resolveOAuthRedirectOrigin,
} from "./supabaseConfig";

export const SUPABASE_AUTH_CALLBACK_MESSAGE = "SUPABASE_AUTH_CALLBACK";

export type AuthCallbackMessage = {
  type: typeof SUPABASE_AUTH_CALLBACK_MESSAGE;
  status: "success" | "error";
};

export function buildOAuthRedirectUrl(opts: {
  origin: string;
  next?: string;
  popup?: boolean;
}): string {
  const url = new URL(`${opts.origin}${AUTH_CALLBACK_PATH}`);
  url.searchParams.set("next", opts.next ?? "/dashboard");
  url.searchParams.set("app_origin", opts.origin);
  if (opts.popup) url.searchParams.set("popup", "1");
  return url.toString();
}

/** Force authorize URL to use our redirect_to (local dev vs production). */
export function applyOAuthRedirectTo(authorizeUrl: string, redirectTo: string): string {
  try {
    const url = new URL(authorizeUrl);
    url.searchParams.set("redirect_to", redirectTo);
    return url.toString();
  } catch {
    return authorizeUrl;
  }
}

function markOAuthPending(origin: string): void {
  try {
    sessionStorage.setItem(OAUTH_RETURN_ORIGIN_KEY, origin);
    sessionStorage.setItem(OAUTH_PENDING_KEY, "1");
  } catch {
    /* private mode */
  }
}

function clearOAuthPending(): void {
  try {
    sessionStorage.removeItem(OAUTH_RETURN_ORIGIN_KEY);
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Google OAuth — same-tab redirect so PKCE cookies and callback stay on the current host.
 */
export async function signInWithGoogle(
  supabase: SupabaseClient,
  opts: { redirectNext?: string; onPopupBlocked?: () => void },
): Promise<{ error: Error | null; usedPopup: boolean }> {
  void opts.onPopupBlocked;

  const origin = resolveOAuthRedirectOrigin();
  if (!origin) {
    return { error: new Error("無法取得目前網址"), usedPopup: false };
  }

  const redirectTo = buildOAuthRedirectUrl({
    origin,
    next: opts.redirectNext ?? "/dashboard",
    popup: false,
  });

  markOAuthPending(origin);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    clearOAuthPending();
    return { error, usedPopup: false };
  }

  if (!data?.url) {
    clearOAuthPending();
    return { error: new Error("missing_oauth_url"), usedPopup: false };
  }

  window.location.assign(applyOAuthRedirectTo(data.url, redirectTo));
  return { error: null, usedPopup: false };
}

export function subscribeToAuthCallbackMessage(
  handler: (msg: AuthCallbackMessage) => void,
): () => void {
  const onMessage = (event: MessageEvent) => {
    const data = event.data as AuthCallbackMessage | undefined;
    if (data?.type !== SUPABASE_AUTH_CALLBACK_MESSAGE) return;

    let pending = false;
    try {
      pending = sessionStorage.getItem(OAUTH_PENDING_KEY) === "1";
    } catch {
      pending = false;
    }
    if (!pending) return;

    clearOAuthPending();
    handler(data);
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
