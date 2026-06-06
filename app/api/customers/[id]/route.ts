import { NextResponse } from "next/server";
import { requireApiAuth } from "../../../lib/apiAuth";
import { API_ACCESS_DENIED, requireCustomerInCompany } from "../../../lib/apiTenant";
import { activeCustomersOnly } from "../../../lib/customerSoftDelete";
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

/**
 * PATCH /api/customers/[id] — postpone follow-up (next_follow_up_at + follow_up_date only).
 */
export async function PATCH(req: Request, context: RouteContext) {
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

  const denied = await requireCustomerInCompany(supabase, customerId, companyId);
  if (denied) {
    return denied;
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "postpone") {
    return NextResponse.json(
      { ok: false, error: "不支援的操作" },
      { status: 400 },
    );
  }

  const nextFollowUpAt =
    typeof body.next_follow_up_at === "string" ? body.next_follow_up_at.trim() : "";
  const followUpDate =
    typeof body.follow_up_date === "string" ? body.follow_up_date.trim() : "";

  if (!nextFollowUpAt || !followUpDate) {
    return NextResponse.json(
      { ok: false, error: "缺少追蹤時間" },
      { status: 400 },
    );
  }

  const { data, error } = await activeCustomersOnly(
    supabase
      .from("customers")
      .update({
        next_follow_up_at: nextFollowUpAt,
        follow_up_date: followUpDate,
      })
      .eq("id", customerId)
      .eq("company_id", companyId),
  )
    .select("id, next_follow_up_at, follow_up_date")
    .maybeSingle();

  if (error) {
    console.error("[api/customers/[id]] PATCH failed:", {
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

  if (!data) {
    console.warn("[api/customers/[id]] PATCH not found:", {
      authUserId: user.id,
      activeCompanyId: companyId,
      customerId,
    });
    return NextResponse.json(
      { ok: false, error: API_ACCESS_DENIED },
      { status: 403 },
    );
  }

  console.log("[api/customers/[id]] PATCH ok:", {
    authUserId: user.id,
    activeCompanyId: companyId,
    customerId,
  });

  return NextResponse.json({
    ok: true,
    customer: data,
    companyId,
  });
}
