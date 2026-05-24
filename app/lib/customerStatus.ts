import type { AppLang } from "./appLang";

/** CRM customer lifecycle status (stored in `customer_status`, synced to legacy `status`). */
export type CustomerStatus =
  | "new_lead"
  | "negotiating"
  | "quoted"
  | "waiting_reply"
  | "scheduled"
  | "in_progress"
  | "won"
  | "completed"
  | "cancelled"
  | "invalid";

export const CUSTOMER_STATUSES: CustomerStatus[] = [
  "new_lead",
  "negotiating",
  "quoted",
  "waiting_reply",
  "scheduled",
  "in_progress",
  "won",
  "completed",
  "cancelled",
  "invalid",
];

/** No longer shown in follow-up reminders / workspace tracking lists. */
export const TRACKING_EXCLUDED_STATUSES: CustomerStatus[] = [
  "completed",
  "cancelled",
  "invalid",
];

export type CustomerStatusVisual = {
  bg: string;
  color: string;
  border: string;
  columnAccent: string;
};

const VISUALS: Record<CustomerStatus, CustomerStatusVisual> = {
  new_lead: {
    bg: "rgba(148,163,184,0.18)",
    color: "#e2e8f0",
    border: "rgba(148,163,184,0.45)",
    columnAccent: "#94a3b8",
  },
  negotiating: {
    bg: "rgba(59,130,246,0.22)",
    color: "#bfdbfe",
    border: "rgba(96,165,250,0.45)",
    columnAccent: "#3b82f6",
  },
  quoted: {
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
  scheduled: {
    bg: "rgba(14,165,233,0.22)",
    color: "#bae6fd",
    border: "rgba(56,189,248,0.5)",
    columnAccent: "#0ea5e9",
  },
  in_progress: {
    bg: "rgba(99,102,241,0.22)",
    color: "#c7d2fe",
    border: "rgba(129,140,248,0.5)",
    columnAccent: "#6366f1",
  },
  won: {
    bg: "rgba(34,197,94,0.22)",
    color: "#bbf7d0",
    border: "rgba(74,222,128,0.55)",
    columnAccent: "#22c55e",
  },
  completed: {
    bg: "rgba(100,116,139,0.25)",
    color: "#e2e8f0",
    border: "rgba(148,163,184,0.5)",
    columnAccent: "#64748b",
  },
  cancelled: {
    bg: "rgba(234,179,8,0.18)",
    color: "#fef08a",
    border: "rgba(250,204,21,0.45)",
    columnAccent: "#eab308",
  },
  invalid: {
    bg: "rgba(239,68,68,0.22)",
    color: "#fecaca",
    border: "rgba(248,113,113,0.5)",
    columnAccent: "#ef4444",
  },
};

export function customerStatusVisual(status: CustomerStatus): CustomerStatusVisual {
  return VISUALS[status];
}

export function isCustomerStatus(value: unknown): value is CustomerStatus {
  if (typeof value !== "string") return false;
  return (CUSTOMER_STATUSES as string[]).includes(value);
}

/** Prefer `customer_status`, fall back to legacy `status`. */
export function getRawCustomerStatus(row: {
  customer_status?: unknown;
  status?: unknown;
}): unknown {
  if (row.customer_status != null && String(row.customer_status).trim() !== "") {
    return row.customer_status;
  }
  return row.status;
}

export function normalizeCustomerStatus(value: unknown): CustomerStatus {
  if (value == null) return "new_lead";
  const raw = String(value).trim().toLowerCase();
  if (!raw) return "new_lead";
  if (isCustomerStatus(raw)) return raw;

  if (raw === "new" || raw === "lead" || raw === "active") return "new_lead";
  if (raw === "contact" || raw === "contacted" || raw === "reached_out") return "negotiating";
  if (raw === "quote" || raw === "quoting" || raw === "proposal") return "quoted";
  if (raw === "waiting" || raw === "follow_up" || raw === "pending") return "waiting_reply";
  if (raw === "closed_won" || raw === "deal") return "won";
  if (raw === "closed_lost" || raw === "lost" || raw === "lost_deal") return "invalid";
  if (raw === "done" || raw === "closed") return "completed";
  if (raw === "canceled" || raw === "cancel") return "cancelled";
  if (raw === "invalid_lead" || raw === "disqualified") return "invalid";

  return "new_lead";
}

export function customerStatusLabel(status: CustomerStatus, _lang?: AppLang): string {
  switch (status) {
    case "new_lead":
      return "新名單";
    case "negotiating":
      return "洽談中";
    case "quoted":
      return "已報價";
    case "waiting_reply":
      return "等待回覆";
    case "scheduled":
      return "已排程";
    case "in_progress":
      return "執行中";
    case "won":
      return "已成交";
    case "completed":
      return "已完成";
    case "cancelled":
      return "取消";
    case "invalid":
      return "無效客戶";
  }
}

export function isCustomerStatusExcludedFromTracking(value: unknown): boolean {
  const s = normalizeCustomerStatus(value);
  return TRACKING_EXCLUDED_STATUSES.includes(s);
}

export function isCustomerWon(value: unknown): boolean {
  return normalizeCustomerStatus(value) === "won";
}

export function isCustomerInvalid(value: unknown): boolean {
  return normalizeCustomerStatus(value) === "invalid";
}

export type CustomerStatusStats = {
  total: number;
  byStatus: Record<CustomerStatus, number>;
  active: number;
  won: number;
  /** @deprecated Use `excluded` or `byStatus.invalid` — kept for pipeline stats UI */
  lost: number;
  excluded: number;
  conversionRate: number;
};

export function computeCustomerStatusStats(
  rows: Array<{ customer_status?: unknown; status?: unknown }>,
): CustomerStatusStats {
  const byStatus = Object.fromEntries(
    CUSTOMER_STATUSES.map((s) => [s, 0]),
  ) as Record<CustomerStatus, number>;

  let won = 0;
  let excluded = 0;

  for (const row of rows) {
    const s = normalizeCustomerStatus(getRawCustomerStatus(row));
    byStatus[s]++;
    if (s === "won") won++;
    if (TRACKING_EXCLUDED_STATUSES.includes(s)) excluded++;
  }

  const resolved = won + byStatus.invalid;
  return {
    total: rows.length,
    byStatus,
    active: rows.length - excluded,
    won,
    lost: byStatus.invalid,
    excluded,
    conversionRate: resolved === 0 ? 0 : won / resolved,
  };
}

/** Payload fields to persist both columns during migration. */
export function customerStatusWritePayload(status: CustomerStatus): {
  customer_status: CustomerStatus;
  status: CustomerStatus;
} {
  return { customer_status: status, status };
}
