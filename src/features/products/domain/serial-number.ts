export const MAX_PRODUCT_SECONDARY_SERIALS = 100;
export const MAX_PRODUCT_SERIAL_LENGTH = 160;

/**
 * Serial numbers have their own identity rules. NFKC and outer whitespace are
 * normalized, but punctuation, diacritics and internal whitespace are kept.
 */
export function cleanSerialNumber(value: string): string {
  return value.normalize("NFKC").trim();
}

export function normalizeSerialNumber(value: string): string {
  return cleanSerialNumber(value).toLocaleUpperCase("es-MX");
}

export function findDuplicateSerialNumber(
  primarySerialNumber: string | null | undefined,
  secondarySerialNumbers: readonly string[],
): string | null {
  const seen = new Set<string>();
  const serials = primarySerialNumber
    ? [primarySerialNumber, ...secondarySerialNumbers]
    : secondarySerialNumbers;

  for (const serialNumber of serials) {
    const normalized = normalizeSerialNumber(serialNumber);
    if (seen.has(normalized)) return cleanSerialNumber(serialNumber);
    seen.add(normalized);
  }

  return null;
}
