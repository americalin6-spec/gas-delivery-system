import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_CALLBACK_PATH } from "./supabaseConfig";

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
  if (opts.popup) url.searchParams.set("popup", "1");
  return url.toString();
}

/** Google OAuth — prefers popup; falls back to same-tab redirect if blocked. */
export async function signInWithGoogle(
  supabase: SupabaseClient,
  opts: { redirectNext?: string; onPopupBlocked?: () => void },
): Promise<{ error: Error | null; usedPopup: boolean }> {
  const origin = window.location.origin;
  const redirectTo = buildOAuthRedirectUrl({
    origin,
    next: opts.redirectNext ?? "/dashboard",
    popup: true,
  });

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
    return { error, usedPopup: false };
  }

  if (!data?.url) {
    return { error: new Error("missing_oauth_url"), usedPopup: false };
  }

  const w = 520;
  const h = 660;
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
  const popup = window.open(
    data.url,
    "google_oauth",
    `popup=yes,width=${w},height=${h},left=${left},top=${top},noreferrer`,
  );

  if (!popup) {
    opts.onPopupBlocked?.();
    const { error: redirectError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: buildOAuthRedirectUrl({
          origin,
          next: opts.redirectNext ?? "/dashboard",
          popup: false,
        }),
      },
    });
    return { error: redirectError, usedPopup: false };
  }

  return { error: null, usedPopup: true };
}

export function subscribeToAuthCallbackMessage(
  handler: (msg: AuthCallbackMessage) => void,
): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as AuthCallbackMessage | undefined;
    if (data?.type !== SUPABASE_AUTH_CALLBACK_MESSAGE) return;
    handler(data);
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
