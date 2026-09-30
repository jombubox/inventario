import { z } from "zod";

import { UNPARENTED_BOXES_LOCATION_ID } from "@/features/locations/domain/quick-add-location";
import { CUSTOM_CATALOG_VALUE } from "@/features/products/domain/catalog-selection";
import { compatibilityMutationSchema } from "@/validators/admin-product";
import { optionalDisplayText, requiredDisplayText } from "@/validators/shared";
import {
  productSerialFields,
  validateProductSerialFields,
} from "@/validators/product-serials";

const catalogSelection = z.union([z.uuid(), z.literal(CUSTOM_CATALOG_VALUE)]);

export const quickAddInventoryMutationSchema = z
  .object({
    productMode: z.enum(["existing", "new"]),
    productId: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      z.uuid().nullable(),
    ),
    brandId: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      catalogSelection.nullable(),
    ),
    customBrandName: optionalDisplayText,
    componentTypeId: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      catalogSelection.nullable(),
    ),
    customComponentTypeName: optionalDisplayText,
    partNumber: optionalDisplayText,
    ...productSerialFields,
    compatibilities: z.array(compatibilityMutationSchema).max(30),
    title: optionalDisplayText,
    locationId: z.union([
      z.uuid("Selecciona una ubicación válida."),
      z.literal(UNPARENTED_BOXES_LOCATION_ID),
    ]),
    boxMode: z.enum(["existing", "new"]),
    boxId: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      z.uuid().nullable(),
    ),
    newBoxCode: optionalDisplayText,
    newBoxName: optionalDisplayText,
    bagLabel: optionalDisplayText,
    quantity: z.coerce
      .number()
      .int("La cantidad debe ser un número entero.")
      .positive("La cantidad debe ser mayor que cero.")
      .max(1_000_000, "La cantidad es demasiado grande."),
  })
  .superRefine((value, context) => {
    if (value.productMode === "new") {
      validateProductSerialFields(value, context);
    }
    if (value.productMode === "existing" && !value.productId) {
      context.addIssue({
        code: "custom",
        path: ["productId"],
        message: "Selecciona un producto existente.",
      });
    }

    if (value.productMode === "new") {
      if (!value.brandId) {
        context.addIssue({ code: "custom", path: ["brandId"], message: "Selecciona una marca." });
      }
      if (value.brandId === CUSTOM_CATALOG_VALUE && !value.customBrandName) {
        context.addIssue({
          code: "custom",
          path: ["customBrandName"],
          message: "Escribe el nombre de la nueva marca.",
        });
      }
      if (!value.componentTypeId) {
        context.addIssue({
          code: "custom",
          path: ["componentTypeId"],
          message: "Selecciona un tipo de componente.",
        });
      }
      if (
        value.componentTypeId === CUSTOM_CATALOG_VALUE &&
        !value.customComponentTypeName
      ) {
        context.addIssue({
          code: "custom",
          path: ["customComponentTypeName"],
          message: "Escribe el nombre del nuevo componente.",
        });
      }
      if (!value.partNumber && value.compatibilities.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["partNumber"],
          message: "Agrega un número de parte o un modelo compatible.",
        });
      }
      if (
        value.brandId === CUSTOM_CATALOG_VALUE &&
        !value.partNumber &&
        value.compatibilities.length > 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["partNumber"],
          message: "Una marca nueva necesita número de parte en este flujo rápido.",
        });
      }
    }

    if (value.boxMode === "existing" && !value.boxId) {
      context.addIssue({
        code: "custom",
        path: ["boxId"],
        message: "Selecciona una caja.",
      });
    }
    if (value.boxMode === "new") {
      if (!value.newBoxCode) {
        context.addIssue({ code: "custom", path: ["newBoxCode"], message: "Escribe el código de la caja." });
      }
      if (!value.newBoxName) {
        context.addIssue({ code: "custom", path: ["newBoxName"], message: "Escribe el nombre de la caja." });
      }
    }
  });

export const deleteBoxMutationSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
});

export const modelSearchQuerySchema = z.object({
  q: requiredDisplayText.pipe(z.string().min(2).max(100)),
});

export type QuickAddInventoryMutationInput = z.infer<
  typeof quickAddInventoryMutationSchema
>;
export type DeleteBoxMutationInput = z.infer<typeof deleteBoxMutationSchema>;
