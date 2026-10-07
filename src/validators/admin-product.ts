import { z } from "zod";

import { productStatusValues } from "@/db/schema/enums";
import { CUSTOM_CATALOG_VALUE } from "@/features/products/domain/catalog-selection";
import { productConditionValues } from "@/features/products/domain/product-condition";
import {
  currencyCode,
  moneyString,
  optionalDisplayText,
  requiredDisplayText,
} from "@/validators/shared";
import {
  productSerialFields,
  validateProductSerialFields,
} from "@/validators/product-serials";

export const compatibilityMutationSchema = z.object({
  brandId: z.uuid("Selecciona una marca válida."),
  model: requiredDisplayText,
  notes: optionalDisplayText,
});

export const productPublicationFields = {
  warranty: optionalDisplayText.pipe(z.string().max(240, "La garantía debe tener 240 caracteres o menos.").nullable().optional()),
  condition: z.enum(productConditionValues, { error: "Selecciona Nuevo o Usado." }).default("NEW"),
  salePrice: z.union([moneyString, z.literal(""), z.null()]).transform((value) => value || null),
  currency: currencyCode.default("MXN"),
  status: z.enum(productStatusValues),
  isPublic: z.boolean(),
};

const productFields = {
  brandId: z.union([
    z.uuid("Selecciona una marca válida."),
    z.literal(CUSTOM_CATALOG_VALUE),
  ]),
  customBrandName: optionalDisplayText.pipe(
    z.string().max(120, "La marca debe tener 120 caracteres o menos.").nullable().optional(),
  ),
  componentTypeId: z.union([
    z.uuid("Selecciona un tipo válido."),
    z.literal(CUSTOM_CATALOG_VALUE),
  ]),
  customComponentTypeName: optionalDisplayText.pipe(
    z.string().max(120, "El tipo de pieza debe tener 120 caracteres o menos.").nullable().optional(),
  ),
  partNumber: optionalDisplayText,
  ...productSerialFields,
  title: optionalDisplayText,
  description: optionalDisplayText,
  ...productPublicationFields,
  compatibilities: z.array(compatibilityMutationSchema).max(30),
};

function validateCatalogSelections(
  value: {
    brandId: string;
    customBrandName?: string | null;
    componentTypeId: string;
    customComponentTypeName?: string | null;
  },
  context: z.RefinementCtx,
) {
  if (value.brandId === CUSTOM_CATALOG_VALUE && !value.customBrandName) {
    context.addIssue({
      code: "custom",
      path: ["customBrandName"],
      message: "Escribe el nombre de la nueva marca.",
    });
  }
  if (
    value.componentTypeId === CUSTOM_CATALOG_VALUE &&
    !value.customComponentTypeName
  ) {
    context.addIssue({
      code: "custom",
      path: ["customComponentTypeName"],
      message: "Escribe el nombre del nuevo tipo de pieza.",
    });
  }
}

export const createProductMutationSchema = z
  .object(productFields)
  .superRefine((value, context) => {
    validateCatalogSelections(value, context);
    validateProductSerialFields(value, context);
  });

export const updateProductMutationSchema = z
  .object({
    id: z.uuid(),
    expectedUpdatedAt: z.coerce.date(),
    ...productFields,
    condition: z.preprocess((value) => value === "" ? null : value, z.enum(productConditionValues).nullable().optional()),
  })
  .superRefine((value, context) => {
    validateCatalogSelections(value, context);
    validateProductSerialFields(value, context);
  });

export const archiveProductMutationSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
});

// Older internal import callers can leave condition unclassified; UI schemas default new creations to NEW.
export type CreateProductMutationInput = Omit<z.infer<typeof createProductMutationSchema>, "condition"> & {
  condition?: "NEW" | "USED" | null;
};
export type UpdateProductMutationInput = z.infer<typeof updateProductMutationSchema>;
