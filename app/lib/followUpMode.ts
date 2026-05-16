export type FollowUpMode = "manual" | "assisted" | "auto";

export function normalizeFollowUpMode(value: unknown): FollowUpMode {
  const s = value == null ? "" : String(value).trim().toLowerCase();
  if (s === "assisted" || s === "auto") return s;
  return "manual";
}

export function followUpModeBadgeMeta(
  mode: FollowUpMode,
  lang: "zh" | "en" = "zh",
): {
  label: string;
  subtitle: string;
  bg: string;
  color: string;
  border: string;
} {
  const zh = lang === "zh";
  switch (mode) {
    case "assisted":
      return {
        label: zh ? "輔助發送" : "Assisted",
        subtitle: zh ? "草稿確認後送出（模擬）" : "Draft, confirm, then send (simulated)",
        bg: "rgba(245,158,11,0.14)",
        color: "#fcd34d",
        border: "rgba(251,191,36,0.45)",
      };
    case "auto":
      return {
        label: zh ? "自動發送" : "Auto",
        subtitle: zh ? "符合排程時自動送出（模擬）" : "Auto-send on schedule (simulated)",
        bg: "rgba(34,197,94,0.14)",
        color: "#86efac",
        border: "rgba(74,222,128,0.45)",
      };
    default:
      return {
        label: zh ? "手動" : "Manual",
        subtitle: zh ? "僅提醒與建議文案" : "Reminders and suggested copy only",
        bg: "rgba(148,163,184,0.14)",
        color: "#cbd5e1",
        border: "rgba(148,163,184,0.35)",
      };
  }
}
