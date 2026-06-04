"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useIsViewportBelow } from "../hooks/useViewportWidth";
import { LOGIN_PATH } from "../lib/authRoutes";
import { clearClientCompanyId } from "../lib/clientCompany";
import { getSupabaseBrowser } from "../lib/supabaseBrowser";

const MOBILE_MAX = 1024;

/**
 * Fixed logout control for authenticated CRM routes (same chrome layer as notifications).
 */
export function CrmLogoutButton() {
  const router = useRouter();
  const isMobile = useIsViewportBelow(MOBILE_MAX);
  const [busy, setBusy] = useState(false);

  const handleLogout = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      clearClientCompanyId();
      const supabase = getSupabaseBrowser();
      await supabase.auth.signOut();
      router.replace(LOGIN_PATH);
      router.refresh();
    } catch (err) {
      console.error("[logout]", err);
      setBusy(false);
    }
  }, [busy, router]);

  const bellOffset = isMobile ? "max(12px, env(safe-area-inset-right))" : "20px";
  const bellSize = isMobile ? 44 : 48;
  const gap = 8;

  return (
    <div
      style={{
        position: "fixed",
        top: isMobile ? "max(12px, env(safe-area-inset-top))" : 16,
        right: `calc(${bellOffset} + ${bellSize + gap}px)`,
        zIndex: 9000,
      }}
    >
      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={busy}
        style={{
          padding: isMobile ? "10px 14px" : "12px 18px",
          borderRadius: 12,
          border: "none",
          background: busy ? "#64748b" : "linear-gradient(90deg, #ef4444, #dc2626)",
          color: "#fff",
          fontSize: isMobile ? 14 : 16,
          fontWeight: 700,
          cursor: busy ? "wait" : "pointer",
          boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
          whiteSpace: "nowrap",
        }}
      >
        {busy ? "登出中…" : "登出"}
      </button>
    </div>
  );
}
