import type { AppLang } from "./appLang";
import {
  customerStatusWritePayload,
  getRawCustomerStatus,
  normalizeCustomerStatus,
  type CustomerStatus,
} from "./customerStatus";

/** Kanban columns — each maps to a CRM `customer_status` on drop (except closed). */
export type PipelineBoardColumn =
  | "new_lead"
  | "negotiating"
  | "quoted"
  | "waiting_reply"
  | "demo"
  | "won"
  | "closed";

export type KanbanColumnVisual = {
  labelZh: string;
  labelEn: string;
  accent: string;
  headerBg: string;
  dropRing: string;
};

export const PIPELINE_BOARD_COLUMNS: PipelineBoardColumn[] = [
  "new_lead",
  "negotiating",
  "quoted",
  "waiting_reply",
  "demo",
  "won",
  "closed",
];

/** Dark premium column accents (pipeline Kanban headers). */
const COLUMN_VISUALS: Record<PipelineBoardColumn, KanbanColumnVisual> = {
  new_lead: {
    labelZh: "新名單",
    labelEn: "New lead",
    accent: "#60a5fa",
    headerBg: "linear-gradient(135deg, rgba(15,39,68,0.95) 0%, rgba(30,58,95,0.88) 100%)",
    dropRing: "rgba(96,165,250,0.55)",
  },
  negotiating: {
    labelZh: "洽談中",
    labelEn: "In discussion",
    accent: "#22d3ee",
    headerBg: "linear-gradient(135deg, rgba(8,47,73,0.95) 0%, rgba(14,116,144,0.55) 100%)",
    dropRing: "rgba(34,211,238,0.5)",
  },
  quoted: {
    labelZh: "已報價",
    labelEn: "Quoted",
    accent: "#fb923c",
    headerBg: "linear-gradient(135deg, rgba(124,45,18,0.9) 0%, rgba(67,20,7,0.85) 100%)",
    dropRing: "rgba(251,146,60,0.5)",
  },
  waiting_reply: {
    labelZh: "等待回覆",
    labelEn: "Waiting reply",
    accent: "#facc15",
    headerBg: "linear-gradient(135deg, rgba(113,63,18,0.92) 0%, rgba(66,32,6,0.88) 100%)",
    dropRing: "rgba(250,204,21,0.48)",
  },
  demo: {
    labelZh: "安排 Demo",
    labelEn: "Demo scheduled",
    accent: "#c084fc",
    headerBg: "linear-gradient(135deg, rgba(88,28,135,0.92) 0%, rgba(59,7,100,0.88) 100%)",
    dropRing: "rgba(192,132,252,0.5)",
  },
  won: {
    labelZh: "成交",
    labelEn: "Won",
    accent: "#4ade80",
    headerBg: "linear-gradient(135deg, rgba(20,83,45,0.92) 0%, rgba(6,78,59,0.85) 100%)",
    dropRing: "rgba(74,222,128,0.5)",
  },
  closed: {
    labelZh: "結案",
    labelEn: "Closed",
    accent: "#94a3b8",
    headerBg: "linear-gradient(135deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.95) 100%)",
    dropRing: "rgba(148,163,184,0.45)",
  },
};

/** Status persisted when a card lands in a column. */
export const BOARD_COLUMN_DEFAULT_STATUS: Record<PipelineBoardColumn, CustomerStatus> = {
  new_lead: "new_lead",
  negotiating: "negotiating",
  quoted: "quoted",
  waiting_reply: "waiting_reply",
  demo: "scheduled",
  won: "won",
  closed: "completed",
};

export function pipelineBoardColumnLabel(col: PipelineBoardColumn, _lang?: AppLang): string {
  return COLUMN_VISUALS[col].labelZh;
}

export function pipelineBoardColumnVisual(col: PipelineBoardColumn): KanbanColumnVisual {
  return COLUMN_VISUALS[col];
}

export function customerStatusToBoardColumn(status: unknown): PipelineBoardColumn {
  const s = normalizeCustomerStatus(status);
  switch (s) {
    case "new_lead":
      return "new_lead";
    case "negotiating":
    case "in_progress":
      return "negotiating";
    case "quoted":
      return "quoted";
    case "waiting_reply":
      return "waiting_reply";
    case "scheduled":
      return "demo";
    case "won":
      return "won";
    case "completed":
    case "cancelled":
    case "invalid":
      return "closed";
    default:
      return "new_lead";
  }
}

export function boardColumnToCustomerStatus(col: PipelineBoardColumn): CustomerStatus {
  return BOARD_COLUMN_DEFAULT_STATUS[col];
}

export { customerStatusWritePayload };
