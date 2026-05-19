import type { AppLang } from "./appLang";

export type PipelineStatus =
  | "new_lead"
  | "contacted"
  | "quoting"
  | "waiting_reply"
  | "won"
  | "lost";

export const PIPELINE_STATUSES: PipelineStatus[] = [
  "new_lead",
  "contacted",
  "quoting",
  "waiting_reply",
  "won",
  "lost",
];

export type PipelineStatusVisual = {
  bg: string;
  color: string;
  border: string;
  columnAccent: string;
};

const VISUALS: Record<PipelineStatus, PipelineStatusVisual> = {
  new_lead: {
    bg: "rgba(148,163,184,0.18)",
    color: "#e2e8f0",
    border: "rgba(148,163,184,0.45)",
    columnAccent: "#94a3b8",
  },
  contacted: {
    bg: "rgba(59,130,246,0.22)",
    color: "#bfdbfe",
    border: "rgba(96,165,250,0.45)",
    columnAccent: "#3b82f6",
  },
  quoting: {
    bg: "rgba(245,158,11,0.22)",
    color: "#fde68a",
    border: "rgba(251,191,36,0.5)",
    columnAccent: "#f59e0b",
  },
  waiting_reply: {
    bg: "rgba(249,115,22,0.22)",
    color: "#fed7aa",
    border: "rgba(251,146,60,0.55)",
    columnAccent: "#f97316",
  },
  won: {
    bg: "rgba(34,197,94,0.22)",
    color: "#bbf7d0",
    border: "rgba(74,222,128,0.55)",
    columnAccent: "#22c55e",
  },
  lost: {
    bg: "rgba(239,68,68,0.22)",
    color: "#fecaca",
    border: "rgba(248,113,113,0.5)",
    columnAccent: "#ef4444",
  },
};

export function pipelineStatusVisual(status: PipelineStatus): PipelineStatusVisual {
  return VISUALS[status];
}

export function isPipelineStatus(value: unknown): value is PipelineStatus {
  if (typeof value !== "string") return false;
  return (PIPELINE_STATUSES as string[]).includes(value);
}

/** Map any value (legacy "active", null, etc.) to a known pipeline status. Defaults to new_lead. */
export function normalizePipelineStatus(value: unknown): PipelineStatus {
  if (value == null) return "new_lead";
  const raw = String(value).trim().toLowerCase();
  if (!raw) return "new_lead";
  if (isPipelineStatus(raw)) return raw;

  // Tolerate legacy / human-readable values.
  if (raw === "new" || raw === "lead" || raw === "active") return "new_lead";
  if (raw === "contact" || raw === "reached_out") return "contacted";
  if (raw === "quote" || raw === "quoted" || raw === "proposal") return "quoting";
  if (raw === "waiting" || raw === "follow_up" || raw === "pending") return "waiting_reply";
  if (raw === "closed_won" || raw === "deal") return "won";
  if (raw === "closed_lost" || raw === "lost_deal") return "lost";

  return "new_lead";
}

export function pipelineStatusLabel(status: PipelineStatus, lang: AppLang): string {
  const zh = lang === "zh";
  switch (status) {
    case "new_lead":
      return zh ? "新名單" : "New lead";
    case "contacted":
      return zh ? "已聯絡" : "Contacted";
    case "quoting":
      return zh ? "報價中" : "Quoting";
    case "waiting_reply":
      return zh ? "等待回覆" : "Waiting reply";
    case "won":
      return zh ? "成交" : "Won";
    case "lost":
      return zh ? "流失" : "Lost";
  }
}

export function isPipelineWon(value: unknown): boolean {
  return normalizePipelineStatus(value) === "won";
}

export function isPipelineLost(value: unknown): boolean {
  return normalizePipelineStatus(value) === "lost";
}

export type PipelineStats = {
  total: number;
  won: number;
  lost: number;
  /** Won / (Won + Lost). Returns 0 when no resolved deals exist. */
  conversionRate: number;
};

export function computePipelineStats(rows: Array<{ status?: unknown }>): PipelineStats {
  let won = 0;
  let lost = 0;
  for (const row of rows) {
    const s = normalizePipelineStatus(row.status);
    if (s === "won") won++;
    else if (s === "lost") lost++;
  }
  const resolved = won + lost;
  return {
    total: rows.length,
    won,
    lost,
    conversionRate: resolved === 0 ? 0 : won / resolved,
  };
}
