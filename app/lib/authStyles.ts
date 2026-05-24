import type { CSSProperties } from "react";

export const authPageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px",
  background:
    "linear-gradient(160deg, #020617 0%, #0f172a 38%, #0c4a6e 72%, #042f2e 100%)",
  boxSizing: "border-box",
};

export const authCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  borderRadius: 20,
  padding: "36px 28px 32px",
  background:
    "linear-gradient(145deg, rgba(30,58,95,0.92) 0%, rgba(6,25,47,0.98) 55%, rgba(0,60,66,0.9) 100%)",
  border: "1px solid rgba(129,140,248,0.28)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
  boxSizing: "border-box",
};

export const authInputStyle: CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.07)",
  color: "#f8fafc",
  fontSize: 16,
  boxSizing: "border-box",
  outline: "none",
};

export const authPrimaryBtnStyle: CSSProperties = {
  width: "100%",
  padding: "14px 20px",
  borderRadius: 12,
  border: "none",
  background: "linear-gradient(90deg, #22c55e, #16a34a)",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 8px 24px rgba(34,197,94,0.3)",
};

export const authGoogleBtnStyle: CSSProperties = {
  width: "100%",
  padding: "14px 20px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.08)",
  color: "#f8fafc",
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
};

export const authLinkStyle: CSSProperties = {
  color: "#86efac",
  textDecoration: "none",
  fontWeight: 600,
};

export const authMutedStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 14,
  lineHeight: 1.55,
};

export const authErrorStyle: CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(248,113,113,0.12)",
  border: "1px solid rgba(248,113,113,0.35)",
  color: "#fecaca",
  fontSize: 14,
};
