/** Homepage CRM writes (manual save or post-analyze persist). */
export const HOMEPAGE_SAVE_SOURCE = "homepage.saveToCrm";
export const HOMEPAGE_ANALYZE_SAVE_SOURCE = "homepage.analyzeComplete";

const ALLOWED_HOMEPAGE_WRITE_SOURCES = new Set([
  HOMEPAGE_SAVE_SOURCE,
  HOMEPAGE_ANALYZE_SAVE_SOURCE,
]);

let activeSaveRequestId: string | null = null;
let writesThisSaveClick = 0;

export function beginHomepageSave(requestId: string): void {
  activeSaveRequestId = requestId;
  writesThisSaveClick = 0;
}

export function endHomepageSave(): void {
  activeSaveRequestId = null;
  writesThisSaveClick = 0;
}

export function getWritesThisSaveClick(): number {
  return writesThisSaveClick;
}

export function assertCustomerWriteAllowed(
  source: string,
  requestId: string,
): { allowed: boolean; reason?: string } {
  if (!ALLOWED_HOMEPAGE_WRITE_SOURCES.has(source)) {
    return {
      allowed: false,
      reason: `customer writes disabled (only homepage save); attempted: ${source}`,
    };
  }

  if (activeSaveRequestId && activeSaveRequestId !== requestId) {
    return {
      allowed: false,
      reason: `blocked: different save in progress (${activeSaveRequestId})`,
    };
  }

  if (writesThisSaveClick >= 1) {
    return {
      allowed: false,
      reason: "blocked: already 1 write this save click",
    };
  }

  return { allowed: true };
}

export function markCustomerWriteCompleted(): void {
  writesThisSaveClick += 1;
}
