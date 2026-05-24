import type { ExtractedCustomerProfile } from "./extractCustomerFromLineChat";
import { isNotProvidedLabel, isValidExtractedCustomerName } from "./extractCustomerFromLineChat";
import { normalizeLineIdForDisplay } from "./lineIdDisplay";

export type CrmFormSnapshot = {
  customerName: string;
  companyName: string;
  industry: string;
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

/**
 * Company name merge — never drop trailing brand words (e.g. Luxury Home Taiwan → Luxury Home).
 * When one value is a strict prefix of the other, keep the longer full name.
 */
export function mergeCompanyNameField(incoming: string, existing: string): string {
  const next = String(incoming ?? "").trim();
  const prev = String(existing ?? "").trim();
  if (isEmptyCrmFieldValue(next)) return prev;
  if (isEmptyCrmFieldValue(prev)) return next;
  if (next === prev) return next;

  const nextLower = next.toLowerCase();
  const prevLower = prev.toLowerCase();
  if (nextLower.startsWith(`${prevLower} `) || (prevLower && nextLower.startsWith(prevLower) && next.length > prev.length)) {
    return next;
  }
  if (prevLower.startsWith(`${nextLower} `) || (nextLower && prevLower.startsWith(nextLower) && prev.length > next.length)) {
    return prev;
  }

  return next;
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
    companyName: mergeCompanyNameField(incoming.companyName, existing.companyName),
    industry: mergeCrmFieldValue(incoming.industry, existing.industry),
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
    industry: extracted.industry,
    phone: extracted.phone,
    lineId: extracted.line_id,
    email: extracted.email,
    note: extracted.customer_need,
  });
  return {
    customer_name: merged.customerName,
    company_name: merged.companyName,
    industry: merged.industry,
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
    industry: String(row.industry ?? "").trim(),
    phone: String(row.phone ?? "").trim(),
    lineId: normalizeLineIdForDisplay(String(row.line_id ?? "")),
    email: String(row.email ?? "").trim(),
    note: String(row.note ?? row.customer_need ?? "").trim(),
  };
  return mergeCrmFormSnapshot(form, incoming);
}
