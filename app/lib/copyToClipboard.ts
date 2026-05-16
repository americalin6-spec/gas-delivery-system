/**
 * Mobile-safe clipboard copy (iOS Safari / Chrome).
 * Tries async Clipboard API, then textarea + execCommand.
 */

export async function copyToClipboard(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to execCommand (common on iOS without user-gesture or insecure context)
    }
  }

  return copyViaExecCommand(value);
}

/** Synchronous copy for use inside click/touch handlers (best iOS success rate). */
export function copyToClipboardSync(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  return copyViaExecCommand(value);
}

function copyViaExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "true");
  ta.setAttribute("aria-hidden", "true");
  ta.contentEditable = "true";
  ta.readOnly = false;

  const s = ta.style;
  s.position = "fixed";
  s.top = "0";
  s.left = "0";
  s.width = "2px";
  s.height = "2px";
  s.padding = "0";
  s.border = "none";
  s.outline = "none";
  s.boxShadow = "none";
  s.background = "transparent";
  s.opacity = "0";
  s.pointerEvents = "none";
  s.fontSize = "16px";
  s.zIndex = "-1";

  document.body.appendChild(ta);

  let ok = false;
  try {
    if (typeof navigator !== "undefined" && /ipad|iphone|ipod/i.test(navigator.userAgent)) {
      const range = document.createRange();
      range.selectNodeContents(ta);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      ta.setSelectionRange(0, text.length);
    } else {
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
    }
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }

  document.body.removeChild(ta);
  return ok;
}
