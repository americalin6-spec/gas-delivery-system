import { NextResponse } from "next/server";
import {
  buildBindingSuccessNotification,
  buildFollowUpReminderNotification,
  buildLineMessageNotification,
  buildNewCustomerNotification,
  buildUrgentCustomerNotification,
  createCrmNotification,
  isCrmNotificationType,
  type CrmNotificationRow,
  type CrmNotificationType,
} from "../../lib/crmNotifications";
import { COMPANY_HEADER_NAME } from "../../lib/companyContext";
import { requireApiAuth } from "../../lib/apiAuth";

const LIST_LIMIT = 50;

type PostBody = {
  type?: string;
  customer_id?: string | null;
  customer_name?: string | null;
  message_preview?: string | null;
  follow_up_hint?: string | null;
  lang?: "zh" | "en";
};

type PatchBody = {
  id?: number;
  all?: boolean;
};

function rowFromDb(raw: Record<string, unknown>): CrmNotificationRow {
  return {
    id: Number(raw.id),
    company_id: Number(raw.company_id),
    customer_id: raw.customer_id != null ? String(raw.customer_id) : null,
    type: String(raw.type) as CrmNotificationType,
    title: String(raw.title ?? ""),
    body: raw.body != null ? String(raw.body) : null,
    read_at: raw.read_at != null ? String(raw.read_at) : null,
    created_at: String(raw.created_at ?? ""),
  };
}

export async function GET(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const { supabase, companyId } = auth;

  const { data, error } = await supabase
    .from("crm_notifications")
    .select("id, company_id, customer_id, type, title, body, read_at, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((r) => rowFromDb(r as Record<string, unknown>));
  const unreadCount = items.filter((n) => n.read_at == null).length;

  return NextResponse.json({ ok: true, items, unreadCount });
}

export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const { supabase, companyId } = auth;
  let body: PostBody = {};
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type?.trim() ?? "";
  if (!isCrmNotificationType(type)) {
    return NextResponse.json({ ok: false, error: "Invalid notification type" }, { status: 400 });
  }

  const lang = body.lang === "en" ? "en" : "zh";
  const customerId = body.customer_id?.toString().trim() || null;
  const customerName = body.customer_name?.trim() || (lang === "zh" ? "客戶" : "Customer");

  let title = "";
  let notifyBody = "";
  let dedupePerDay = false;

  switch (type) {
    case "line_message": {
      const built = buildLineMessageNotification(
        customerName,
        body.message_preview ?? "",
        lang,
      );
      title = built.title;
      notifyBody = built.body;
      break;
    }
    case "new_customer": {
      const built = buildNewCustomerNotification(customerName, lang);
      title = built.title;
      notifyBody = built.body;
      break;
    }
    case "binding_success": {
      const built = buildBindingSuccessNotification(customerName, lang);
      title = built.title;
      notifyBody = built.body;
      break;
    }
    case "follow_up_reminder": {
      const built = buildFollowUpReminderNotification(
        customerName,
        body.follow_up_hint,
        lang,
      );
      title = built.title;
      notifyBody = built.body;
      dedupePerDay = true;
      break;
    }
    case "urgent_customer": {
      const built = buildUrgentCustomerNotification(customerName, lang);
      title = built.title;
      notifyBody = built.body;
      dedupePerDay = true;
      break;
    }
  }

  const id = await createCrmNotification(supabase, {
    companyId,
    type,
    title,
    body: notifyBody,
    customerId,
    dedupePerDay,
  });

  if (id == null) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: Request) {
  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const { supabase, companyId } = auth;
  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const nowIso = new Date().toISOString();

  if (body.all) {
    const { error } = await supabase
      .from("crm_notifications")
      .update({ read_at: nowIso })
      .eq("company_id", companyId)
      .is("read_at", null);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "id or all required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_notifications")
    .update({ read_at: nowIso })
    .eq("company_id", companyId)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export function notificationApiHeaders(companyId: number): HeadersInit {
  return {
    "Content-Type": "application/json",
    [COMPANY_HEADER_NAME]: String(companyId),
  };
}
