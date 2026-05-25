"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[dashboard] error boundary:", error);
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        background: "#06192f",
        color: "white",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 22 }}>儀表板暫時無法載入</h1>
        <p style={{ color: "#fecaca", marginBottom: 20 }}>{error.message}</p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "12px 20px",
            borderRadius: 10,
            border: "none",
            background: "#22c55e",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          重試
        </button>
      </div>
    </main>
  );
}
