import { normalizeWhitespace } from "@/features/shared/domain/text-normalization";

export type BuildProductTitleInput = {
  componentType: string;
  brand: string;
  partNumber?: string | null;
  compatibleModel?: string | null;
};

function optionalDisplayValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

export function buildProductTitle(input: BuildProductTitleInput): string {
  const componentType = normalizeWhitespace(input.componentType);
  const brand = normalizeWhitespace(input.brand);
  const partNumber = optionalDisplayValue(input.partNumber);
  const compatibleModel = optionalDisplayValue(input.compatibleModel);
  const left = [componentType, partNumber].filter(Boolean).join(" ");
  const right = [brand, compatibleModel].filter(Boolean).join(" ");

  return [left, right].filter(Boolean).join(" | ");
}
