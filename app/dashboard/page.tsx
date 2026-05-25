/**
 * Server-only static dashboard — no client hooks or providers on this page.
 * If React #310 still appears, the cause is root layout / ClientRootProviders.
 */
export default function DashboardPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        background: "linear-gradient(90deg, #06192f, #003c42)",
        color: "white",
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "32px 28px",
          borderRadius: 16,
          background: "rgba(15, 23, 42, 0.9)",
          border: "1px solid rgba(129, 140, 248, 0.35)",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: "0 0 16px", fontSize: 28, fontWeight: 800 }}>
          LINE Work AI
        </h1>
        <p style={{ margin: "0 0 12px", fontSize: 20, color: "#86efac", fontWeight: 700 }}>
          儀表板測試成功
        </p>
        <p style={{ margin: 0, fontSize: 15, color: "#94a3b8" }}>目前為安全測試版</p>
      </div>
    </main>
  );
}
