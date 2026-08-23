import { eq } from "drizzle-orm";

import type { DatabaseExecutor } from "@/db/executor";
import { inventoryItems } from "@/db/schema";

export function createInventoryRepository(db: DatabaseExecutor) {
  return {
    findByInventoryCode(inventoryCode: string) {
      return db.query.inventoryItems.findFirst({
        where: eq(inventoryItems.inventoryCode, inventoryCode),
        with: { location: true, product: true },
      });
    },

    findByProductId(productId: string) {
      return db.query.inventoryItems.findMany({
        where: eq(inventoryItems.productId, productId),
        with: { location: true },
      });
    },
  };
}
