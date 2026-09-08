import "server-only";

import { createHash } from "node:crypto";

const WINDOW_MILLISECONDS = 60_000;
const MAX_FAILURES = 5;

type Attempt = { failures: number; windowStartedAt: number };

const attempts = new Map<string, Attempt>();

function requestIdentity(requestHeaders: Headers): string {
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || requestHeaders.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(address, "utf8").digest("base64url");
}

function currentAttempt(requestHeaders: Headers, now = Date.now()): [string, Attempt | null] {
  const identity = requestIdentity(requestHeaders);
  const attempt = attempts.get(identity);
  if (!attempt || now - attempt.windowStartedAt >= WINDOW_MILLISECONDS) {
    attempts.delete(identity);
    return [identity, null];
  }
  return [identity, attempt];
}

export function isLoginAttemptAllowed(requestHeaders: Headers, now = Date.now()): boolean {
  const [, attempt] = currentAttempt(requestHeaders, now);
  return !attempt || attempt.failures < MAX_FAILURES;
}

export function recordLoginFailure(requestHeaders: Headers, now = Date.now()): void {
  const [identity, attempt] = currentAttempt(requestHeaders, now);
  attempts.set(
    identity,
    attempt
      ? { ...attempt, failures: attempt.failures + 1 }
      : { failures: 1, windowStartedAt: now },
  );
}

export function clearLoginFailures(requestHeaders: Headers): void {
  attempts.delete(requestIdentity(requestHeaders));
}
