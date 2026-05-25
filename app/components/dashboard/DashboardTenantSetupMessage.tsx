"use client";

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

export function DashboardTenantSetupMessage({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <main style={pageStyle}>
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          padding: "28px 24px",
          borderRadius: 16,
          background: "rgba(15,23,42,0.85)",
          border: "1px solid rgba(129,140,248,0.35)",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800 }}>工作區載入失敗</h1>
        <p style={{ margin: "0 0 16px", fontSize: 15, lineHeight: 1.6, color: "#cbd5e1" }}>
          登入已成功，但尚未取得您的工作區。請稍後再試，或重新整理頁面。
        </p>
        {error ? (
          <p
            style={{
              margin: "0 0 20px",
              fontSize: 13,
              lineHeight: 1.5,
              color: "#fecaca",
              wordBreak: "break-word",
            }}
          >
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          style={{
            width: "100%",
            padding: "14px 20px",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(90deg, #22c55e, #16a34a)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          重新載入工作區
        </button>
      </div>
    </main>
  );
}
