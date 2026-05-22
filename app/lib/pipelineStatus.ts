/**
 * @deprecated Use `customerStatus.ts`. Re-exports for existing imports.
 */
import type { AppLang } from "./appLang";
import {
  computeCustomerStatusStats,
  customerStatusLabel,
  customerStatusVisual,
  customerStatusWritePayload,
  CUSTOMER_STATUSES,
  getRawCustomerStatus,
  isCustomerInvalid,
  isCustomerStatus,
  isCustomerWon,
  normalizeCustomerStatus,
  type CustomerStatus,
  type CustomerStatusStats,
  type CustomerStatusVisual,
} from "./customerStatus";

export { customerStatusWritePayload, getRawCustomerStatus };

export type PipelineStatus = CustomerStatus;
export const PIPELINE_STATUSES = CUSTOMER_STATUSES;
export type PipelineStatusVisual = CustomerStatusVisual;
export type PipelineStats = CustomerStatusStats;

export const pipelineStatusVisual = customerStatusVisual;
export const isPipelineStatus = isCustomerStatus;
export const normalizePipelineStatus = normalizeCustomerStatus;
export const pipelineStatusLabel = customerStatusLabel;
export const isPipelineWon = isCustomerWon;
export const isPipelineLost = isCustomerInvalid;
export const computePipelineStats = computeCustomerStatusStats;

export function isPipelineClosed(row: { customer_status?: unknown; status?: unknown }): boolean {
  return normalizeCustomerStatus(getRawCustomerStatus(row)) === "invalid";
}
