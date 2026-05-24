import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCustomerByIdForActiveCompany } from "./customersTenant";

/** Standard tenant isolation error for CRM APIs. */
export const API_ACCESS_DENIED = "無法存取此資料";

export function accessDeniedResponse(status: 403 | 404 = 403): NextResponse {
  return NextResponse.json({ ok: false, error: API_ACCESS_DENIED }, { status });
}

/**
 * Returns a NextResponse when the customer is missing or not in this company;
 * returns null when access is allowed.
 */
export async function requireCustomerInCompany(
  supabase: SupabaseClient,
  customerId: string,
  companyId: number,
): Promise<NextResponse | null> {
  const id = customerId.trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "customer_id is required" },
      { status: 400 },
    );
  }

  const { customer, error } = await fetchCustomerByIdForActiveCompany<
    Record<string, unknown>
  >(supabase, id, companyId);

  if (error) {
    console.error("[apiTenant] customer lookup failed:", {
      customerId: id,
      companyId,
      message: error.message,
    });
    return accessDeniedResponse(403);
  }

  if (!customer) {
    return accessDeniedResponse(403);
  }

  return null;
}
