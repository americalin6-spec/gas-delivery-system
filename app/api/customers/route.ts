import { NextResponse } from "next/server";
import { requireApiAuth } from "../../lib/apiAuth";
import { customerInsertPayload, upsertCustomerForCompany } from "../../lib/customersTenant";
import {
  fetchCustomersForCompanyList,
  filterRowsForCompany,
} from "../../lib/customersListServer";

/**
 * CRM customer list — company_id from server-side membership only (never client header).
 */
export async function GET(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { supabase, user, companyId } = auth;
  const trash =
    new URL(req.url).searchParams.get("trash") === "1" ||
    new URL(req.url).searchParams.get("trash") === "true";

  const result = await fetchCustomersForCompanyList(supabase, companyId, { trash });

  if (result.error) {
    console.error("[api/customers] GET failed:", {
      authUserId: user.id,
      activeCompanyId: companyId,
      trash,
      error: result.error,
    });
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        rows: [],
        fetchedCount: 0,
        companyId,
      },
      { status: 500 },
    );
  }

  const rows = filterRowsForCompany(result.rows, companyId);
  const customerIds = rows.map((r) => r.id);

  console.log("[api/customers] GET ok:", {
    authUserId: user.id,
    activeCompanyId: companyId,
    returnedCustomerIds: customerIds,
    returnedCount: rows.length,
    trash,
  });

  return NextResponse.json({
    ok: true,
    rows,
    fetchedCount: rows.length,
    companyId,
    stats: result.stats,
  });
}

/**
 * Create customer — company_id and created_by_user_id forced on server.
 */
export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { supabase, user, companyId } = auth;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const row = customerInsertPayload(
    {
      ...body,
      created_by_user_id: user.id,
    },
    companyId,
  );

  const requestId = `api-customers-${Date.now()}`;
  const result = await upsertCustomerForCompany(supabase, companyId, row, {
    requestId,
    source: "api.customers.POST",
  });

  if (result.error) {
    console.error("[api/customers] POST failed:", {
      authUserId: user.id,
      activeCompanyId: companyId,
      error: result.error.message,
    });
    return NextResponse.json(
      { ok: false, error: result.error.message },
      { status: 500 },
    );
  }

  console.log("[api/customers] POST ok:", {
    authUserId: user.id,
    activeCompanyId: companyId,
    customerId: result.customerId,
  });

  return NextResponse.json({
    ok: true,
    customerId: result.customerId,
    customer: result.customer,
    companyId,
  });
}
