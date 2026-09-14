import { normalizeSkuToken } from "@/features/products/domain/product-normalization";
import { slugify } from "@/features/shared/domain/text-normalization";

export type CatalogIdentityKind = "brand" | "componentType";

export function buildCatalogIdentity(
  name: string,
  kind: CatalogIdentityKind,
  ordinal = 1,
): { code: string; slug: string } {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 99) {
    throw new Error("Catalog identity ordinal must be between 1 and 99.");
  }

  const fallbackCode = kind === "brand" ? "BR" : "CT";
  const fallbackSlug = kind === "brand" ? "marca" : "componente";
  const baseCode = normalizeSkuToken(name).slice(0, 3) || fallbackCode;
  const code = ordinal === 1
    ? baseCode.padEnd(2, "0")
    : `${baseCode.slice(0, 6)}${String(ordinal).padStart(2, "0")}`;
  const baseSlug = slugify(name) || fallbackSlug;

  return {
    code,
    slug: ordinal === 1 ? baseSlug : `${baseSlug}-${ordinal}`,
  };
}
