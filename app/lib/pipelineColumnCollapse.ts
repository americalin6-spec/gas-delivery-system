import type { PipelineBoardColumn } from "./pipelineBoardColumns";
import { PIPELINE_BOARD_COLUMNS } from "./pipelineBoardColumns";

const STORAGE_KEY = "grouptools-pipeline-collapsed-columns";

function isPipelineBoardColumn(value: unknown): value is PipelineBoardColumn {
  return (
    typeof value === "string" &&
    (PIPELINE_BOARD_COLUMNS as string[]).includes(value)
  );
}

export function loadCollapsedPipelineColumns(): Set<PipelineBoardColumn> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(isPipelineBoardColumn));
  } catch {
    return new Set();
  }
}

export function saveCollapsedPipelineColumns(collapsed: Set<PipelineBoardColumn>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...collapsed]),
    );
  } catch {
    // localStorage may be unavailable
  }
}
