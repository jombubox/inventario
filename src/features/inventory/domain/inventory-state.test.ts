import { describe, expect, it } from "vitest";

import { isInventoryQuantityStatusValid } from "@/features/inventory/domain/inventory-state";
import { createInventoryMutationSchema } from "@/validators/admin-inventory";
import { inventoryItemInputSchema } from "@/validators/inventory";

const productId = "81fa4d55-7177-4921-ad03-01042a8102af";

describe("inventory quantity and status", () => {
  it("requires positive stock for live inventory states", () => {
    expect(isInventoryQuantityStatusValid(1, "AVAILABLE")).toBe(true);
    expect(isInventoryQuantityStatusValid(0, "RESERVED")).toBe(false);
    expect(isInventoryQuantityStatusValid(2, "DAMAGED")).toBe(true);
  });

  it("requires zero stock for terminal states", () => {
    expect(isInventoryQuantityStatusValid(0, "SOLD")).toBe(true);
    expect(isInventoryQuantityStatusValid(1, "SCRAPPED")).toBe(false);
  });

  it("enforces the same rule in the Zod input boundary", () => {
    expect(
      inventoryItemInputSchema.safeParse({ productId, quantity: 0, status: "AVAILABLE" })
        .success,
    ).toBe(false);
  });

  it("rejects non-positive quantities when creating an administrative lot", () => {
    const common = {
      productId,
      locationId: null,
      condition: "NEW" as const,
      status: "AVAILABLE" as const,
      acquiredAt: null,
      acquisitionSource: null,
      purchaseCost: null,
      notes: null,
      legacyBagNumber: null,
      legacyLocationCode: null,
    };

    expect(createInventoryMutationSchema.safeParse({ ...common, quantity: -1 }).success).toBe(false);
    expect(createInventoryMutationSchema.safeParse({ ...common, quantity: 0 }).success).toBe(false);
  });
});
