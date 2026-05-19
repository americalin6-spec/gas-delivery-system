import { NextResponse } from "next/server";
import { formatLineReminderMessage } from "../../lib/reminderCheck";
import {
  fetchReminderCheckState,
  runReminderCheck,
  type ReminderCheckResult,
} from "../../lib/runReminderCheck";
import {
  DEFAULT_COMPANY_ID,
  getServerCompanyId,
  listCompanyIds,
} from "../../lib/companyContext";
import { getSupabaseServer } from "../../lib/supabaseServer";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;

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

/**
 * Resolve which companies a request should act on.
 * - `?company_id=N` → only that tenant
 * - `x-company-id: N` header → only that tenant (used from the CRM UI preview)
 * - otherwise → all known tenants from `companies` table
 */
async function resolveTargetCompanies(req: Request): Promise<number[]> {
  const queryId = parseQueryCompanyId(req);
  if (queryId) return [queryId];

  const headerId = req.headers.get("x-company-id");
  if (headerId) {
    const headerScoped = getServerCompanyId(req);
    if (headerScoped) return [headerScoped];
  }

  return listCompanyIds(getSupabaseServer());
}

/** Daily cron: check CRM follow_up_date and push LINE Bot message to yourself. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const previewOnly = url.searchParams.get("preview") === "1";

  const companyIds = await resolveTargetCompanies(req);

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

  const companyIds = await resolveTargetCompanies(req);
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
    fallbackCompanyId: DEFAULT_COMPANY_ID,
  };
}
