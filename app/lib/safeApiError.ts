import "server-only";

import { NextResponse } from "next/server";
import type { LogEventType } from "./serverLogger";
import { serverLogger, toSafeErrorMessage } from "./serverLogger";

export type SafeApiErrorContext = {
  eventType?: LogEventType;
  companyId?: number | null;
  userId?: string | null;
  route?: string;
  meta?: Record<string, unknown>;
};

/** Log unexpected errors without leaking secrets or customer message content. */
export function logUnexpectedException(
  err: unknown,
  ctx: SafeApiErrorContext = {},
): void {
  serverLogger.error(
    {
      eventType: ctx.eventType ?? "exception",
      status: "error",
      companyId: ctx.companyId ?? null,
      userId: ctx.userId ?? null,
      message: toSafeErrorMessage(err),
      meta: {
        ...(ctx.route ? { route: ctx.route } : {}),
        ...ctx.meta,
      },
    },
    err,
  );
}

/** Production-safe JSON error for API routes. */
export function jsonSafeApiError(
  publicMessage: string,
  status: number,
  ctx: SafeApiErrorContext = {},
): NextResponse {
  serverLogger.error({
    eventType: ctx.eventType ?? "api.error",
    status: "error",
    companyId: ctx.companyId ?? null,
    userId: ctx.userId ?? null,
    message: publicMessage,
    meta: {
      httpStatus: status,
      ...(ctx.route ? { route: ctx.route } : {}),
      ...ctx.meta,
    },
  });

  return NextResponse.json({ ok: false, error: publicMessage }, { status });
}
