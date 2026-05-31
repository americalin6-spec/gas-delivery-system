"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { AiQuotaUpgradeFlow } from "../lib/aiQuotaUpgrade";

type Props = {
  open: boolean;
  flow: AiQuotaUpgradeFlow | null;
  onClose: () => void;
};

export function AiQuotaUpgradeModal({ open, flow, onClose }: Props) {
  const router = useRouter();

  const handleCta = useCallback(() => {
    onClose();
    router.push("/pricing");
  }, [onClose, router]);

  if (!open || !flow) return null;

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 10000,
    background: "rgba(2,6,23,0.72)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  };

  const panel: React.CSSProperties = {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    border: "1px solid rgba(129,140,248,0.35)",
    background: "linear-gradient(160deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.98) 100%)",
    boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
    padding: "24px 22px",
    color: "#f8fafc",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-quota-upgrade-title"
      style={overlay}
      onClick={onClose}
    >
      <div
        style={panel}
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="ai-quota-upgrade-title"
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {flow.title}
        </h2>
        {flow.lines.map((line) => (
          <p
            key={line}
            style={{
              margin: "12px 0 0",
              fontSize: 15,
              lineHeight: 1.6,
              color: "#cbd5e1",
            }}
          >
            {line}
          </p>
        ))}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 22,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={handleCta}
            style={{
              flex: "1 1 auto",
              minWidth: 120,
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 15,
              background: "linear-gradient(135deg,#818cf8,#c084fc)",
              color: "#0f172a",
            }}
          >
            {flow.ctaLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.35)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 15,
              background: "transparent",
              color: "#e2e8f0",
            }}
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
