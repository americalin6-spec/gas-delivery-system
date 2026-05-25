"use client";

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

type DashboardState = {
  loading: boolean;
  email: string;
  companyText: string;
  loggingOut: boolean;
};

const INITIAL_STATE: DashboardState = {
  loading: true,
  email: "",
  companyText: "載入中…",
  loggingOut: false,
};

/**
 * Emergency minimal dashboard — fixed hook count (useState + useEffect only).
 */
export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);

  useEffect(() => {
    console.log("[dashboard] mounted");
    let alive = true;

    void (async () => {
      let next: DashboardState = {
        loading: false,
        email: "",
        companyText: "尚未登入",
        loggingOut: false,
      };

      try {
        const supabase = getSupabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!alive) return;

        if (!user) {
          console.log("[dashboard] session loaded: none");
          setState(next);
          return;
        }

        const email = user.email ?? "（無電子郵件）";
        console.log("[dashboard] session loaded:", email);

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

        if (!alive) return;

        if (res.ok && body.ok && body.companyId) {
          const id = Number(body.companyId);
          console.log("[dashboard] tenant loaded:", body.companyId);
          next = {
            loading: false,
            email,
            companyText:
              Number.isFinite(id) && id > 0 ? String(id) : "尚未取得工作區",
            loggingOut: false,
          };
        } else {
          console.log("[dashboard] tenant loaded: missing", body.error ?? res.status);
          next = {
            loading: false,
            email,
            companyText: body.error ?? "尚未取得工作區（請稍後再試）",
            loggingOut: false,
          };
        }
      } catch (err) {
        if (!alive) return;
        console.log("[dashboard] tenant loaded: error", err);
        next = {
          loading: false,
          email: next.email,
          companyText: "工作區載入失敗",
          loggingOut: false,
        };
      }

      setState(next);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800 }}>LINE Work AI</h1>
        <p style={{ margin: "0 0 24px", fontSize: 17, color: "#86efac", fontWeight: 700 }}>
          登入成功
        </p>

        <p style={{ margin: "0 0 8px", fontSize: 14, color: "#94a3b8" }}>使用者</p>
        <p style={{ margin: "0 0 20px", fontSize: 16, wordBreak: "break-word" }}>
          {state.loading ? "載入中…" : state.email || "—"}
        </p>

        <p style={{ margin: "0 0 8px", fontSize: 14, color: "#94a3b8" }}>工作區 ID</p>
        <p style={{ margin: "0 0 28px", fontSize: 16 }}>{state.companyText}</p>

        <button
          type="button"
          disabled={state.loggingOut}
          onClick={() => {
            void (async () => {
              setState((prev) => ({ ...prev, loggingOut: true }));
              try {
                await getSupabaseBrowser().auth.signOut();
                window.location.replace("/login");
              } catch (err) {
                console.log("[dashboard] logout error", err);
                setState((prev) => ({ ...prev, loggingOut: false }));
              }
            })();
          }}
          style={{
            width: "100%",
            padding: "14px 20px",
            borderRadius: 12,
            border: "none",
            background: state.loggingOut
              ? "#64748b"
              : "linear-gradient(90deg, #ef4444, #dc2626)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: state.loggingOut ? "wait" : "pointer",
          }}
        >
          {state.loggingOut ? "登出中…" : "登出"}
        </button>
      </div>
    </main>
  );
}
