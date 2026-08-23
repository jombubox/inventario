const sensitiveKeyPattern =
  /password|passphrase|secret|token|cookie|authorization|database.?url|private.?key|access.?key|refresh.?token|session.?token/iu;

const connectionStringPattern = /postgres(?:ql)?:\/\/[^\s"']+/giu;
const bearerPattern = /bearer\s+[a-z0-9._~+/=-]+/giu;

export function redactText(value: string): string {
  return value
    .replace(connectionStringPattern, "[REDACTED_DATABASE_URL]")
    .replace(bearerPattern, "Bearer [REDACTED]");
}

export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[REDACTED_DEPTH]";
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object" || value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveData(entry, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKeyPattern.test(key)
        ? "[REDACTED]"
        : redactSensitiveData(entry, depth + 1),
    ]),
  );
}

export function redactRecord(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  return redactSensitiveData(value) as Record<string, unknown> | null | undefined;
}
