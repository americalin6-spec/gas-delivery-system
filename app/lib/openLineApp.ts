/** Opens the LINE app (not a specific chat). No Messaging API. */
export const LINE_APP_DEEP_LINK = "line://";

/** Web entry when the app deep link is unavailable */
export const LINE_WEB_HOME = "https://line.me/";

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
