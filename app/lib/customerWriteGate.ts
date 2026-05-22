/** Only homepage saveToCrm may create/update customers while isolating the duplicate-save bug. */
export const HOMEPAGE_SAVE_SOURCE = "homepage.saveToCrm";

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
  if (source !== HOMEPAGE_SAVE_SOURCE) {
    return {
      allowed: false,
      reason: `customer writes disabled (only ${HOMEPAGE_SAVE_SOURCE}); attempted: ${source}`,
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
