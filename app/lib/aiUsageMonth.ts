/** Calendar month key for AI usage counters — always `YYYY-MM` (UTC). */

const USAGE_MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;

export function currentUsageMonthKey(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Normalize DB / API values to `YYYY-MM`, or null if not a valid month key. */
export function normalizeUsageMonthKey(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const digits = String(Math.floor(value));
    if (digits.length === 6) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
    }
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = USAGE_MONTH_KEY_RE.exec(raw);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) {
      return `${iso[1]}-${iso[2]}`;
    }
    return null;
  }

  const compact = /^(\d{4})(\d{2})$/.exec(raw);
  if (compact) {
    const month = Number(compact[2]);
    if (month >= 1 && month <= 12) {
      return `${compact[1]}-${compact[2]}`;
    }
  }

  return null;
}

export function isSameUsageMonth(
  stored: unknown,
  expected: string = currentUsageMonthKey(),
): boolean {
  const normalized = normalizeUsageMonthKey(stored);
  const target = normalizeUsageMonthKey(expected);
  if (!normalized || !target) return false;
  return normalized === target;
}

/** Parse integer usage counters only — never treat `YYYY-MM` as a number. */
export function parseUsageCount(value: unknown): number {
  if (typeof value === "string" && USAGE_MONTH_KEY_RE.test(value.trim())) {
    return 0;
  }
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** Legacy `YYYYMM` integer month keys (e.g. 202605) for older DB columns. */
export function legacyUsageMonthInt(monthKey: string): number | null {
  const normalized = normalizeUsageMonthKey(monthKey);
  if (!normalized) return null;
  const [year, month] = normalized.split("-");
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return y * 100 + m;
}

export function isAiUsageMonthTypeMismatchError(message: string | undefined): boolean {
  if (!message) return false;
  return /invalid input syntax for type integer/i.test(message);
}
