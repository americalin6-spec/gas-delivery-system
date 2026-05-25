"use client";

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px",
  background: "linear-gradient(90deg,#06192f,#003c42)",
  color: "#cbd5e1",
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  boxSizing: "border-box" as const,
};

export function DashboardLoadingScreen({
  message = "正在載入儀表板…",
}: {
  message?: string;
}) {
  return (
    <main style={pageStyle} role="status" aria-live="polite" aria-busy="true">
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div
          style={{
            width: 40,
            height: 40,
            margin: "0 auto 16px",
            borderRadius: "50%",
            border: "3px solid rgba(129,140,248,0.25)",
            borderTopColor: "#818cf8",
            animation: "dashboardSpin 0.9s linear infinite",
          }}
        />
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55 }}>{message}</p>
      </div>
      <style>{`
        @keyframes dashboardSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
