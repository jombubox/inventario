import { z } from "zod";

import { productStatusValues } from "@/db/schema/enums";
import {
  currencyCode,
  moneyString,
  optionalDisplayText,
  requiredDisplayText,
} from "@/validators/shared";

export const compatibilityMutationSchema = z.object({
  brandId: z.uuid("Selecciona una marca válida."),
  model: requiredDisplayText,
  notes: optionalDisplayText,
});

const productFields = {
  brandId: z.uuid("Selecciona una marca válida."),
  componentTypeId: z.uuid("Selecciona un tipo válido."),
  partNumber: optionalDisplayText,
  title: optionalDisplayText,
  description: optionalDisplayText,
  salePrice: z.union([moneyString, z.literal(""), z.null()]).transform((value) => value || null),
  currency: currencyCode.default("MXN"),
  status: z.enum(productStatusValues),
  isPublic: z.boolean(),
  compatibilities: z.array(compatibilityMutationSchema).max(30),
};

export const createProductMutationSchema = z.object(productFields);

export const updateProductMutationSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
  ...productFields,
});

export const archiveProductMutationSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
});

export type CreateProductMutationInput = z.infer<typeof createProductMutationSchema>;
export type UpdateProductMutationInput = z.infer<typeof updateProductMutationSchema>;
