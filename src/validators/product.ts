import { z } from "zod";

import { productStatusValues } from "@/db/schema/enums";
import { currencyCode, moneyString, optionalDisplayText, requiredDisplayText } from "@/validators/shared";

const skuFormat = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const slugFormat = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export const productBaseInputSchema = z.object({
  sku: z.string().regex(skuFormat).optional(),
  slug: z.string().regex(slugFormat).optional(),
  brandId: z.uuid(),
  componentTypeId: z.uuid(),
  partNumber: optionalDisplayText,
  title: requiredDisplayText,
  description: optionalDisplayText,
  salePrice: moneyString.nullable().optional(),
  currency: currencyCode.default("MXN"),
  status: z.enum(productStatusValues).default("DRAFT"),
  isPublic: z.boolean().default(false),
});

export const productCompatibilityInputSchema = z.object({
  productId: z.uuid(),
  brandId: z.uuid(),
  model: requiredDisplayText,
  notes: optionalDisplayText,
});

export type ProductBaseInput = z.infer<typeof productBaseInputSchema>;
export type ProductCompatibilityInput = z.infer<typeof productCompatibilityInputSchema>;
