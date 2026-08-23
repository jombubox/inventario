import { z } from "zod";

import {
  inventoryConditionValues,
  inventoryStatusValues,
} from "@/db/schema/enums";
import { isInventoryQuantityStatusValid } from "@/features/inventory/domain/inventory-state";
import { moneyString, optionalDisplayText, requiredDisplayText } from "@/validators/shared";

const nullableUuidFromForm = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.uuid().nullable(),
);

export const createInventoryMutationSchema = z
  .object({
    productId: z.uuid(),
    locationId: nullableUuidFromForm,
    quantity: z.coerce.number().int().positive("La cantidad inicial debe ser mayor que cero."),
    condition: z.enum(inventoryConditionValues),
    status: z.enum(inventoryStatusValues),
    acquiredAt: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      z.coerce.date().nullable(),
    ),
    acquisitionSource: optionalDisplayText,
    purchaseCost: z.union([moneyString, z.literal(""), z.null()]).transform((value) => value || null),
    notes: optionalDisplayText,
    legacyBagNumber: optionalDisplayText,
    legacyLocationCode: optionalDisplayText,
  })
  .superRefine((value, context) => {
    if (!isInventoryQuantityStatusValid(value.quantity, value.status)) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "El estado inicial debe admitir una cantidad positiva.",
      });
    }
  });

export const updateInventoryDetailsMutationSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
  condition: z.enum(inventoryConditionValues),
  acquiredAt: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.coerce.date().nullable(),
  ),
  acquisitionSource: optionalDisplayText,
  purchaseCost: z.union([moneyString, z.literal(""), z.null()]).transform((value) => value || null),
  notes: optionalDisplayText,
  legacyBagNumber: optionalDisplayText,
  legacyLocationCode: optionalDisplayText,
});

export const moveInventoryMutationSchema = z.object({
  id: z.uuid(),
  toLocationId: z.uuid(),
  reason: requiredDisplayText,
});

export const adjustInventoryMutationSchema = z
  .object({
    id: z.uuid(),
    newQuantity: z.coerce.number().int().nonnegative(),
    newStatus: z.enum(inventoryStatusValues),
    reason: requiredDisplayText,
  })
  .superRefine((value, context) => {
    if (!isInventoryQuantityStatusValid(value.newQuantity, value.newStatus)) {
      context.addIssue({
        code: "custom",
        path: ["newQuantity"],
        message: "La cantidad y el estado seleccionados no son compatibles.",
      });
    }
  });

export const stockMovementMutationSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(["IN", "OUT", "SALE", "RETURN"]),
    quantity: z.coerce.number().int().positive("La cantidad debe ser mayor que cero."),
    resultingStatus: z.enum(inventoryStatusValues),
    reason: requiredDisplayText,
  })
  .superRefine((value, context) => {
    const increasing = value.type === "IN" || value.type === "RETURN";
    const allowed = increasing
      ? ["AVAILABLE", "RESERVED", "DAMAGED"].includes(value.resultingStatus)
      : ["SOLD", "SCRAPPED"].includes(value.resultingStatus);
    if (!allowed) {
      context.addIssue({
        code: "custom",
        path: ["resultingStatus"],
        message: increasing
          ? "Una entrada debe dejar el inventario en un estado físico activo."
          : "Selecciona el estado terminal que se usará si la cantidad llega a cero.",
      });
    }
  });

export type CreateInventoryMutationInput = z.infer<typeof createInventoryMutationSchema>;
export type UpdateInventoryDetailsMutationInput = z.infer<
  typeof updateInventoryDetailsMutationSchema
>;
export type AdjustInventoryMutationInput = z.infer<typeof adjustInventoryMutationSchema>;
export type StockMovementMutationInput = z.infer<typeof stockMovementMutationSchema>;
