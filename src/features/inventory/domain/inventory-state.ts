import type { inventoryStatusValues } from "@/db/schema/enums";

export type InventoryStatus = (typeof inventoryStatusValues)[number];

export function isInventoryQuantityStatusValid(
  quantity: number,
  status: InventoryStatus,
): boolean {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    return false;
  }

  return status === "SOLD" || status === "SCRAPPED" ? quantity === 0 : quantity > 0;
}
