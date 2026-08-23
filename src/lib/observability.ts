import "server-only";

import { redactSensitiveData, redactText } from "@/lib/redaction";

export type LogLevel = "info" | "warn" | "error";

function errorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { errorType: typeof error };
  const possibleCode = (error as Error & { code?: unknown }).code;
  return {
    errorName: error.name,
    errorMessage: redactText(error.message).slice(0, 500),
    ...(typeof possibleCode === "string" ? { errorCode: possibleCode } : {}),
  };
}

export function getRequestId(request?: Request): string {
  return (
    request?.headers.get("x-request-id") ??
    request?.headers.get("cf-ray") ??
    crypto.randomUUID()
  ).slice(0, 128);
}

export function logServerEvent(
  level: LogLevel,
  event: string,
  context: Record<string, unknown> = {},
): void {
  const entry = redactSensitiveData({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  });
  const serialized = JSON.stringify(entry);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export function logServerError(
  event: string,
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  logServerEvent("error", event, { ...context, ...errorDetails(error) });
}

export function requestIdHeaders(requestId: string): HeadersInit {
  return { "X-Request-Id": requestId };
}
