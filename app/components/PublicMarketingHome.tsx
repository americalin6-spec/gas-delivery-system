"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAppLang } from "../hooks/useAppLang";
import { useViewportWidth } from "../hooks/useViewportWidth";
import { DASHBOARD_PATH, LOGIN_PATH } from "../lib/authRoutes";
import { getSupabaseBrowser } from "../lib/supabaseBrowser";
import { PublicMarketingHero } from "./PublicMarketingHero";

const HOME_MOBILE_MAX_WIDTH = 1024;

/**
 * Public "/" only — no CRM hooks, no customers API, no follow-up workspace.
 * Auth is checked only when the user clicks 免費試用.
 */
export function PublicMarketingHome() {
  const router = useRouter();
  const { lang } = useAppLang();
  const viewportWidth = useViewportWidth();
  const isMobile = viewportWidth === null || viewportWidth < HOME_MOBILE_MAX_WIDTH;
  const [trialBusy, setTrialBusy] = useState(false);

  const handleStartTrial = useCallback(async () => {
    if (trialBusy) return;
    setTrialBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      router.push(user ? DASHBOARD_PATH : LOGIN_PATH);
    } catch {
      router.push(LOGIN_PATH);
    } finally {
      setTrialBusy(false);
    }
  }, [router, trialBusy]);

  return (
    <main
      style={{
        minHeight: "100vh",
        overflowX: "hidden",
        background: "linear-gradient(90deg,#06192f,#003c42)",
        padding: isMobile
          ? "16px 16px max(24px, env(safe-area-inset-bottom))"
          : "32px 24px 48px",
        color: "white",
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        boxSizing: "border-box",
      }}
    >
      <PublicMarketingHero
        lang={lang}
        isMobile={isMobile}
        onStartTrial={() => void handleStartTrial()}
      />
    </main>
  );
}
