export function normalizeWhitespace(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function removeDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
}

export function normalizeComparableText(value: string): string {
  return removeDiacritics(normalizeWhitespace(value)).toUpperCase();
}

export function normalizeIdentifier(value: string): string {
  return normalizeComparableText(value).replace(/[^A-Z0-9]/gu, "");
}

export function slugify(value: string): string {
  return removeDiacritics(normalizeWhitespace(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}
