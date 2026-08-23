import { z } from "zod";

import {
  normalizeBrand,
  normalizeComponentType,
  normalizeSkuToken,
} from "@/features/products/domain/product-normalization";
import { slugify } from "@/features/shared/domain/text-normalization";
import { requiredDisplayText } from "@/validators/shared";

const catalogCode = z
  .string()
  .transform(normalizeSkuToken)
  .pipe(z.string().regex(/^[A-Z0-9]{2,8}$/u));

export const brandInputSchema = z.object({
  name: requiredDisplayText,
  code: catalogCode,
  active: z.boolean().default(true),
});

export const componentTypeInputSchema = z.object({
  name: requiredDisplayText,
  code: catalogCode,
  active: z.boolean().default(true),
});

export function toBrandRecord(input: z.input<typeof brandInputSchema>) {
  const parsed = brandInputSchema.parse(input);

  return {
    ...parsed,
    normalizedName: normalizeBrand(parsed.name),
    slug: slugify(parsed.name),
  };
}

export function toComponentTypeRecord(input: z.input<typeof componentTypeInputSchema>) {
  const parsed = componentTypeInputSchema.parse(input);

  return {
    ...parsed,
    normalizedName: normalizeComponentType(parsed.name),
    slug: slugify(parsed.name),
  };
}

export type BrandInput = z.infer<typeof brandInputSchema>;
export type ComponentTypeInput = z.infer<typeof componentTypeInputSchema>;
