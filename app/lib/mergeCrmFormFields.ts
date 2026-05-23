import type { ExtractedCustomerProfile } from "./extractCustomerFromLineChat";
import { isNotProvidedLabel, isValidExtractedCustomerName } from "./extractCustomerFromLineChat";
import { normalizeLineIdForDisplay } from "./lineIdDisplay";

export type CrmFormSnapshot = {
  customerName: string;
  companyName: string;
  phone: string;
  lineId: string;
  email: string;
  note: string;
};

/** True when a CRM field has no usable value (empty or placeholder). */
export function isEmptyCrmFieldValue(value: string | null | undefined): boolean {
  const t = String(value ?? "").trim();
  if (!t) return true;
  return isNotProvidedLabel(t);
}

/** Merge incoming extraction into existing form — never overwrite with empty / 未提供. */
export function mergeCrmFieldValue(incoming: string, existing: string): string {
  if (isEmptyCrmFieldValue(incoming)) {
    return String(existing ?? "").trim();
  }
  return String(incoming).trim();
}

export function mergeCustomerNameField(incoming: string, existing: string): string {
  const next = String(incoming ?? "").trim();
  const prev = String(existing ?? "").trim();
  if (isValidExtractedCustomerName(next)) return next;
  if (isValidExtractedCustomerName(prev)) return prev;
  if (!isEmptyCrmFieldValue(next)) return next;
  return prev;
}

export function mergeCrmFormSnapshot(
  existing: CrmFormSnapshot,
  incoming: CrmFormSnapshot,
): CrmFormSnapshot {
  return {
    customerName: mergeCustomerNameField(incoming.customerName, existing.customerName),
    companyName: mergeCrmFieldValue(incoming.companyName, existing.companyName),
    phone: mergeCrmFieldValue(incoming.phone, existing.phone),
    lineId: mergeCrmFieldValue(
      normalizeLineIdForDisplay(incoming.lineId),
      normalizeLineIdForDisplay(existing.lineId),
    ),
    email: mergeCrmFieldValue(incoming.email, existing.email),
    note: mergeCrmFieldValue(incoming.note, existing.note),
  };
}

/** Preview panel: show merged value; caller uses notDetected only when this is empty. */
export function buildExtractedPreviewDisplay(
  extracted: ExtractedCustomerProfile,
  existing: CrmFormSnapshot,
): ExtractedCustomerProfile {
  const merged = mergeCrmFormSnapshot(existing, {
    customerName: extracted.customer_name,
    companyName: extracted.company_name,
    phone: extracted.phone,
    lineId: extracted.line_id,
    email: extracted.email,
    note: extracted.customer_need,
  });
  return {
    customer_name: merged.customerName,
    company_name: merged.companyName,
    phone: merged.phone,
    line_id: merged.lineId,
    email: merged.email,
    customer_need: merged.note || extracted.customer_need,
  };
}

/** Apply saved DB row onto form — only non-empty columns from server. */
export function mergeFormFromSavedCustomerRow(
  form: CrmFormSnapshot,
  row: Record<string, unknown>,
): CrmFormSnapshot {
  const incoming: CrmFormSnapshot = {
    customerName: String(row.customer_name ?? "").trim(),
    companyName: String(row.company_name ?? "").trim(),
    phone: String(row.phone ?? "").trim(),
    lineId: normalizeLineIdForDisplay(String(row.line_id ?? "")),
    email: String(row.email ?? "").trim(),
    note: String(row.note ?? row.customer_need ?? "").trim(),
  };
  return mergeCrmFormSnapshot(form, incoming);
}
