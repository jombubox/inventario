import { z } from "zod";

import {
  inventoryConditionValues,
  inventoryMovementTypeValues,
  inventoryStatusValues,
} from "@/db/schema/enums";
import { isInventoryQuantityStatusValid } from "@/features/inventory/domain/inventory-state";
import { moneyString, optionalDisplayText, requiredDisplayText } from "@/validators/shared";

export const inventoryItemInputSchema = z
  .object({
    productId: z.uuid(),
    locationId: z.uuid().nullable().default(null),
    quantity: z.int().nonnegative(),
    condition: z.enum(inventoryConditionValues).default("UNKNOWN"),
    status: z.enum(inventoryStatusValues).default("AVAILABLE"),
    acquiredAt: z.date().nullable().optional(),
    acquisitionSource: optionalDisplayText,
    purchaseCost: moneyString.nullable().optional(),
    notes: optionalDisplayText,
    legacyBagNumber: optionalDisplayText,
    legacyLocationCode: optionalDisplayText,
  })
  .superRefine((value, context) => {
    if (!isInventoryQuantityStatusValid(value.quantity, value.status)) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message:
          "AVAILABLE, RESERVED, and DAMAGED require positive quantity; SOLD and SCRAPPED require zero.",
      });
    }
  });

export const inventoryMovementInputSchema = z
  .object({
    inventoryItemId: z.uuid(),
    type: z.enum(inventoryMovementTypeValues),
    quantity: z.int().positive(),
    fromLocationId: z.uuid().nullable().default(null),
    toLocationId: z.uuid().nullable().default(null),
    userId: z.uuid().nullable().default(null),
    reason: requiredDisplayText,
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.fromLocationId && value.fromLocationId === value.toLocationId) {
      context.addIssue({
        code: "custom",
        path: ["toLocationId"],
        message: "Movement locations must be different.",
      });
    }

    if (value.type === "MOVE" && (!value.fromLocationId || !value.toLocationId)) {
      context.addIssue({
        code: "custom",
        path: ["type"],
        message: "MOVE requires both source and destination locations.",
      });
    }
  });

export type InventoryItemInput = z.infer<typeof inventoryItemInputSchema>;
export type InventoryMovementInput = z.infer<typeof inventoryMovementInputSchema>;
