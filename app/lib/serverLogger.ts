import "server-only";

import "./observabilitySinks";

/**
 * Centralized structured logging for production SaaS operations.
 * Future sinks: Sentry, Logtail, Datadog (see observabilitySinks.ts).
 */

export type LogEventType =
  | "auth.login_success"
  | "auth.login_failure"
  | "ai.analysis_request"
  | "ai.quota_deducted"
  | "ai.quota_denied"
  | "subscription.changed"
  | "payment.callback"
  | "webhook.failure"
  | "api.error"
  | "exception";

export type LogStatus = "ok" | "error" | "warn" | "skipped";

export type LogLevel = "info" | "warn" | "error";

export type StructuredLogEntry = {
  timestamp: string;
  level: LogLevel;
  event_type: LogEventType;
  status: LogStatus;
  company_id: number | null;
  user_id: string | null;
  message: string | null;
  environment: string;
  meta?: Record<string, unknown>;
};

export type LogInput = {
  eventType: LogEventType;
  status: LogStatus;
  companyId?: number | null;
  userId?: string | null;
  message?: string | null;
  meta?: Record<string, unknown>;
};

const SENSITIVE_KEY =
  /(password|secret|token|authorization|cookie|api[_-]?key|signature|webhook|bearer|channel_access)/i;

const CONTENT_KEY =
  /^(text|content|message|body|rawBody|lineText|messages|prompt|customer_message)$/i;

function truncate(value: string, max = 240): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key) || CONTENT_KEY.test(key)) {
    return "[redacted]";
  }
  if (typeof value === "string") {
    return truncate(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v, i) => sanitizeValue(String(i), v));
  }
  if (value && typeof value === "object") {
    return sanitizeMeta(value as Record<string, unknown>);
  }
  return value;
}

export function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = sanitizeValue(key, value);
  }
  return out;
}

export function toSafeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return truncate(err.message || err.name || "Error", 500);
  }
  return truncate(String(err), 500);
}

function appEnvironment(): string {
  return (
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "development"
  );
}

function shouldLogLevel(level: LogLevel): boolean {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  const order: LogLevel[] = ["info", "warn", "error"];
  const minIdx = order.indexOf(
    configured === "warn" ? "warn" : configured === "error" ? "error" : "info",
  );
  const levelIdx = order.indexOf(level);
  return levelIdx >= minIdx;
}

function buildEntry(level: LogLevel, input: LogInput): StructuredLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    event_type: input.eventType,
    status: input.status,
    company_id:
      input.companyId != null && Number.isFinite(input.companyId)
        ? Math.floor(Number(input.companyId))
        : null,
    user_id: input.userId?.trim() || null,
    message: input.message ? truncate(input.message, 500) : null,
    environment: appEnvironment(),
    ...(input.meta && Object.keys(input.meta).length > 0
      ? { meta: sanitizeMeta(input.meta) }
      : {}),
  };
}

type LogSink = (entry: StructuredLogEntry) => void;

const sinks: LogSink[] = [];

/** Register external log sinks (Sentry, Logtail, Datadog, etc.). */
export function registerLogSink(sink: LogSink): void {
  sinks.push(sink);
}

function emitConsole(entry: StructuredLogEntry): void {
  const line = JSON.stringify(entry);
  switch (entry.level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

function emit(level: LogLevel, input: LogInput): void {
  if (!shouldLogLevel(level)) return;
  const entry = buildEntry(level, input);
  emitConsole(entry);
  for (const sink of sinks) {
    try {
      sink(entry);
    } catch {
      /* never break app flow for logging */
    }
  }
}

export const serverLogger = {
  info(input: LogInput): void {
    emit("info", input);
  },
  warn(input: LogInput): void {
    emit("warn", input);
  },
  error(input: LogInput, err?: unknown): void {
    const message =
      input.message ??
      (err != null ? toSafeErrorMessage(err) : null);
    emit("error", { ...input, message });
  },
};
