import "server-only";

import type { StructuredLogEntry } from "./serverLogger";
import { registerLogSink } from "./serverLogger";

let registered = false;

/**
 * Hook point for third-party observability providers.
 * Enable via env when integrating (no-op until configured).
 */
export function ensureObservabilitySinks(): void {
  if (registered) return;
  registered = true;

  if (process.env.SENTRY_DSN?.trim()) {
    registerLogSink(sentrySinkStub);
  }
  if (process.env.LOGTAIL_SOURCE_TOKEN?.trim()) {
    registerLogSink(logtailSinkStub);
  }
  if (process.env.DATADOG_API_KEY?.trim()) {
    registerLogSink(datadogSinkStub);
  }
}

function sentrySinkStub(_entry: StructuredLogEntry): void {
  // Future: Sentry.captureMessage / captureException with tags from entry
}

function logtailSinkStub(_entry: StructuredLogEntry): void {
  // Future: HTTP ingest to Better Stack / Logtail
}

function datadogSinkStub(_entry: StructuredLogEntry): void {
  // Future: Datadog logs API or OpenTelemetry exporter
}

ensureObservabilitySinks();
