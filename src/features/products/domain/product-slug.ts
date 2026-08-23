import { InvalidProductSlugError } from "@/features/products/domain/domain-errors";
import { slugify } from "@/features/shared/domain/text-normalization";

export type GenerateProductSlugInput = {
  componentType: string;
  brand: string;
  sku: string;
  partNumber?: string | null;
  compatibleModel?: string | null;
};

export function generateProductSlug(input: GenerateProductSlugInput): string {
  const semanticParts = [
    input.componentType,
    input.partNumber,
    input.brand,
    input.compatibleModel,
  ].filter((value): value is string => Boolean(value));
  const slug = slugify(semanticParts.join(" ")) || slugify(input.sku);

  if (!slug) {
    throw new InvalidProductSlugError("Product data does not contain a usable slug token.");
  }

  return slug;
}

export function resolveStableProductSlug(
  existingSlug: string | null | undefined,
  input: GenerateProductSlugInput,
): string {
  return existingSlug && existingSlug.length > 0 ? existingSlug : generateProductSlug(input);
}

export function appendSlugCollisionSuffix(baseSlug: string, ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 2) {
    throw new InvalidProductSlugError("A slug suffix must be an integer greater than one.");
  }

  return `${baseSlug}-${ordinal}`;
}
