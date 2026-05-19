import { NextResponse } from "next/server";
import { formatLineReminderMessage } from "../../lib/reminderCheck";
import { fetchReminderCheckState, runReminderCheck } from "../../lib/runReminderCheck";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

/** Daily cron: check CRM follow_up_date and push LINE Bot message to yourself. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const previewOnly = url.searchParams.get("preview") === "1";

  if (previewOnly) {
    const { due, rows, error } = await fetchReminderCheckState();
    return NextResponse.json({
      ok: !error,
      ...(error ? { supabaseError: error } : {}),
      dueCount: due.length,
      fetchedRowCount: rows.length,
      preview: formatLineReminderMessage(due, "zh"),
    });
  }

  const result = await runReminderCheck({ force });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let force = false;
  try {
    const body = (await req.json()) as { force?: boolean };
    force = Boolean(body.force);
  } catch {
    /* empty body ok for cron */
  }

  const result = await runReminderCheck({ force });
  return NextResponse.json(result);
}
