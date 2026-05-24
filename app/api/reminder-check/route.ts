import { NextResponse } from "next/server";
import { formatLineReminderMessage } from "../../lib/reminderCheck";
import {
  fetchReminderCheckState,
  runReminderCheck,
  type ReminderCheckResult,
} from "../../lib/runReminderCheck";
import { listCompanyIds } from "../../lib/companyContext";
import { getSupabaseServer } from "../../lib/supabaseServer";
import { requireApiAuth } from "../../lib/apiAuth";

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

function parseQueryCompanyId(req: Request): number | null {
  const raw = new URL(req.url).searchParams.get("company_id");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

/** Cron: all companies or `?company_id=N`. Signed-in CRM: active company only. */
async function resolveTargetCompanies(req: Request): Promise<number[] | NextResponse> {
  if (isCronAuthorized(req)) {
    const queryId = parseQueryCompanyId(req);
    if (queryId) return [queryId];
    return listCompanyIds(getSupabaseServer());
  }

  const auth = await requireApiAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }
  return [auth.companyId];
}

/** Daily cron: check CRM follow_up_date and push LINE Bot message to yourself. */
export async function GET(req: Request) {
  const companyIds = await resolveTargetCompanies(req);
  if (companyIds instanceof NextResponse) {
    return companyIds;
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const previewOnly = url.searchParams.get("preview") === "1";

  if (previewOnly) {
    const previews = await Promise.all(
      companyIds.map(async (companyId) => {
        const { due, rows, error } = await fetchReminderCheckState(companyId);
        return {
          companyId,
          ok: !error,
          ...(error ? { supabaseError: error } : {}),
          dueCount: due.length,
          fetchedRowCount: rows.length,
          preview: formatLineReminderMessage(due, "zh"),
        };
      }),
    );

    if (previews.length === 1) {
      return NextResponse.json(previews[0]);
    }
    return NextResponse.json({
      ok: previews.every((p) => p.ok),
      companies: previews,
    });
  }

  const results = await Promise.all(
    companyIds.map((companyId) => runReminderCheck({ force, companyId })),
  );

  if (results.length === 1) {
    return NextResponse.json(results[0]);
  }
  return NextResponse.json({
    ok: results.every((r) => r.ok),
    runs: results,
    summary: summarizeRuns(results),
  });
}

export async function POST(req: Request) {
  const companyIds = await resolveTargetCompanies(req);
  if (companyIds instanceof NextResponse) {
    return companyIds;
  }

  let force = false;
  try {
    const body = (await req.json()) as { force?: boolean };
    force = Boolean(body.force);
  } catch {
    /* empty body ok for cron */
  }

  const results = await Promise.all(
    companyIds.map((companyId) => runReminderCheck({ force, companyId })),
  );

  if (results.length === 1) {
    return NextResponse.json(results[0]);
  }
  return NextResponse.json({
    ok: results.every((r) => r.ok),
    runs: results,
    summary: summarizeRuns(results),
  });
}

function summarizeRuns(results: ReminderCheckResult[]) {
  return {
    companies: results.length,
    totalDue: results.reduce((sum, r) => sum + r.dueCount, 0),
    totalSent: results.filter((r) => r.sent).length,
  };
}
