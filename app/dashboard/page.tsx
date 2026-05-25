"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "../lib/supabaseBrowser";

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px",
  background: "linear-gradient(90deg,#06192f,#003c42)",
  color: "white",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  boxSizing: "border-box" as const,
};

const cardStyle = {
  width: "100%",
  maxWidth: 420,
  padding: "32px 28px",
  borderRadius: 16,
  background: "rgba(15,23,42,0.9)",
  border: "1px solid rgba(129,140,248,0.35)",
  textAlign: "center" as const,
};

/**
 * Emergency minimal dashboard — stable render only (no CRM UI).
 */
export default function DashboardPage() {
  const router = useRouter();
  const [sessionLoading, setSessionLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [tenantNote, setTenantNote] = useState("正在載入工作區…");
  const [logoutBusy, setLogoutBusy] = useState(false);

  useEffect(() => {
    console.log("[dashboard] mounted");
    const supabase = getSupabaseBrowser();

    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setUserEmail("");
          setCompanyId(null);
          setTenantNote("尚未登入");
          console.log("[dashboard] session loaded: none");
          return;
        }

        setUserEmail(user.email ?? "（無電子郵件）");
        console.log("[dashboard] session loaded:", user.email ?? user.id);

        const res = await fetch("/api/tenant/bootstrap", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          companyId?: number;
          error?: string;
        };

        if (res.ok && body.ok && body.companyId) {
          const id = Number(body.companyId);
          setCompanyId(Number.isFinite(id) && id > 0 ? id : null);
          setTenantNote("");
          console.log("[dashboard] tenant loaded:", body.companyId);
        } else {
          setCompanyId(null);
          setTenantNote(body.error ?? "尚未取得工作區（請稍後再試）");
          console.log("[dashboard] tenant loaded: missing", body.error ?? res.status);
        }
      } catch (err) {
        setCompanyId(null);
        setTenantNote("工作區載入失敗");
        console.log("[dashboard] tenant loaded: error", err);
      } finally {
        setSessionLoading(false);
      }
    })();
  }, []);

  async function handleLogout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      await supabase.auth.signOut();
      router.replace("/login");
    } catch (err) {
      console.log("[dashboard] logout error", err);
      setLogoutBusy(false);
    }
  }

  const companyLabel =
    companyId != null && companyId > 0
      ? String(companyId)
      : sessionLoading
        ? "載入中…"
        : tenantNote || "尚未設定";

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800 }}>LINE Work AI</h1>
        <p style={{ margin: "0 0 24px", fontSize: 17, color: "#86efac", fontWeight: 700 }}>
          登入成功
        </p>

        <p style={{ margin: "0 0 8px", fontSize: 14, color: "#94a3b8" }}>使用者</p>
        <p style={{ margin: "0 0 20px", fontSize: 16, wordBreak: "break-word" }}>
          {sessionLoading ? "載入中…" : userEmail || "—"}
        </p>

        <p style={{ margin: "0 0 8px", fontSize: 14, color: "#94a3b8" }}>工作區 ID</p>
        <p style={{ margin: "0 0 28px", fontSize: 16 }}>{companyLabel}</p>

        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={logoutBusy}
          style={{
            width: "100%",
            padding: "14px 20px",
            borderRadius: 12,
            border: "none",
            background: logoutBusy ? "#64748b" : "linear-gradient(90deg, #ef4444, #dc2626)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: logoutBusy ? "wait" : "pointer",
          }}
        >
          {logoutBusy ? "登出中…" : "登出"}
        </button>
      </div>
    </main>
  );
}
