"use client";

import { useRouter } from "next/navigation";
import { HomeLandingHero } from "./components/HomeLandingHero";
import { useAppLang } from "./hooks/useAppLang";
import { useAuthSession } from "./hooks/useAuthSession";
import { useViewportWidth } from "./hooks/useViewportWidth";
import { DASHBOARD_PATH } from "./lib/authRoutes";

const HOME_MOBILE_MAX_WIDTH = 1024;

/** Public marketing homepage — CRM app lives at /dashboard after login. */
export default function PublicHomePage() {
  const router = useRouter();
  const { lang } = useAppLang();
  const { session, loading } = useAuthSession();
  const viewportWidth = useViewportWidth();
  const isMobile = viewportWidth === null || viewportWidth < HOME_MOBILE_MAX_WIDTH;

  function handleStart() {
    if (session) {
      router.push(DASHBOARD_PATH);
      return;
    }
    router.push("/login");
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "linear-gradient(90deg,#06192f,#003c42)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#94a3b8",
          fontSize: 16,
        }}
      >
        載入中…
      </main>
    );
  }

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
      <HomeLandingHero lang={lang} isMobile={isMobile} onStart={handleStart} />
    </main>
  );
}
