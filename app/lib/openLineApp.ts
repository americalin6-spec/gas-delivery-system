/** Opens the LINE app (not a specific chat). No Messaging API. */
export const LINE_APP_DEEP_LINK = "line://";

/** Web entry when the app deep link is unavailable */
export const LINE_WEB_HOME = "https://line.me/";

/**
 * Build LINE add-friend link from customers.line_id (public @id).
 * Opens line.me add-friend page (desktop shows QR); not a direct chat deep link.
 * Do not use line_users.line_user_id (Messaging API id).
 */
export function buildLineChatUrl(lineId: string | null | undefined): string | null {
  const rawLineId = lineId?.trim();
  if (!rawLineId) return null;

  const handle = rawLineId.replace(/^@/, "").replace(/^~/, "");
  if (!handle) return null;

  return `https://line.me/R/ti/p/~${encodeURIComponent(handle)}`;
}

/** Open LINE add-friend page in a new tab. Returns false when customers.line_id is missing. */
export function openLineChat(lineId: string | null | undefined): boolean {
  if (typeof window === "undefined") return false;
  const url = buildLineChatUrl(lineId);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/**
 * Attempts to open the LINE app via custom URL scheme.
 * Calls onLikelyFail if the page stays visible (typical when the app did not open).
 */
export function tryOpenLineApp(onLikelyFail: () => void, timeoutMs = 2000): () => void {
  if (typeof window === "undefined") {
    onLikelyFail();
    return () => {};
  }

  let failed = false;
  let timer: number | undefined;

  const fail = () => {
    if (failed) return;
    failed = true;
    cleanup();
    onLikelyFail();
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      failed = true;
      cleanup();
    }
  };

  const onPageHide = () => {
    failed = true;
    cleanup();
  };

  function cleanup() {
    if (timer !== undefined) window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  }

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  timer = window.setTimeout(fail, timeoutMs);

  try {
    window.location.href = LINE_APP_DEEP_LINK;
  } catch {
    fail();
  }

  return cleanup;
}
