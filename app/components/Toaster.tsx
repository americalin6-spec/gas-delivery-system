"use client";

/**
 * Minimal toast host for hydration isolation testing.
 */
export function Toaster() {
  return (
    <div
      id="toaster"
      role="region"
      aria-label="通知"
      style={{
        position: "fixed",
        inset: "16px 16px auto auto",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
        maxWidth: "min(420px, calc(100vw - 32px))",
      }}
    />
  );
}
