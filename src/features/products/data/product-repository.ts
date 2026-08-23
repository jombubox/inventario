import { and, eq, isNull } from "drizzle-orm";

import type { DatabaseExecutor } from "@/db/executor";
import { products } from "@/db/schema";

export function createProductRepository(db: DatabaseExecutor) {
  return {
    findBySku(sku: string) {
      return db.query.products.findFirst({
        where: and(eq(products.sku, sku), isNull(products.deletedAt)),
      });
    },

    findDuplicateCandidates({
      brandId,
      componentTypeId,
      normalizedPartNumber,
    }: {
      brandId: string;
      componentTypeId: string;
      normalizedPartNumber: string;
    }) {
      return db.query.products.findMany({
        where: and(
          eq(products.brandId, brandId),
          eq(products.componentTypeId, componentTypeId),
          eq(products.normalizedPartNumber, normalizedPartNumber),
          isNull(products.deletedAt),
        ),
      });
    },
  };
}
