import { normalizeWhitespace } from "@/features/shared/domain/text-normalization";

export function modelFromQuery(query: string, brandName: string): string {
  const cleaned = normalizeWhitespace(query);
  const prefix = `${normalizeWhitespace(brandName)} `;
  return cleaned.toLocaleUpperCase("es-MX").startsWith(prefix.toLocaleUpperCase("es-MX"))
    ? cleaned.slice(prefix.length).trim()
    : cleaned;
}
