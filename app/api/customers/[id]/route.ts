import { NextResponse } from "next/server";
import { requireApiAuth } from "../../../lib/apiAuth";
import { API_ACCESS_DENIED } from "../../../lib/apiTenant";
import { fetchCustomerByIdForActiveCompany } from "../../../lib/customersTenant";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function resolveCustomerId(context: RouteContext): Promise<string> {
  const params = await Promise.resolve(context.params);
  return String(params.id ?? "").trim();
}

/**
 * GET /api/customers/[id] — single customer scoped to authenticated user's company.
 */
export async function GET(req: Request, context: RouteContext) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const customerId = await resolveCustomerId(context);
  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "缺少客戶 id" },
      { status: 400 },
    );
  }

  const { supabase, user, companyId } = auth;

  const { customer, error } = await fetchCustomerByIdForActiveCompany<{
    id: string | number;
    company_id?: number | null;
  }>(supabase, customerId, companyId);

  if (error) {
    console.error("[api/customers/[id]] GET failed:", {
      authUserId: user.id,
      activeCompanyId: companyId,
      customerId,
      error: error.message,
    });
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  if (!customer) {
    console.warn("[api/customers/[id]] not found or wrong tenant:", {
      authUserId: user.id,
      activeCompanyId: companyId,
      customerId,
    });
    return NextResponse.json(
      { ok: false, error: API_ACCESS_DENIED },
      { status: 403 },
    );
  }

  const rowCompanyId = Number(customer.company_id);
  if (!Number.isFinite(rowCompanyId) || rowCompanyId !== companyId) {
    console.warn("[api/customers/[id]] company mismatch:", {
      authUserId: user.id,
      activeCompanyId: companyId,
      customerId,
      rowCompanyId: customer.company_id ?? null,
    });
    return NextResponse.json(
      { ok: false, error: API_ACCESS_DENIED },
      { status: 403 },
    );
  }

  console.log("[api/customers/[id]] GET ok:", {
    authUserId: user.id,
    activeCompanyId: companyId,
    customerId,
    customerCompanyId: rowCompanyId,
  });

  return NextResponse.json({
    ok: true,
    customer,
    companyId,
  });
}
