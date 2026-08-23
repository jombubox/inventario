import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  componentTypes,
  inventoryItems,
  inventoryMovements,
  importJobs,
  productImages,
  products,
} from "@/db/schema";

export async function getDashboardData(db: Database) {
  const [productMetrics, inventoryMetrics, recentMovements, inventoryByType, recentProducts, recentImports, recentImportErrors] =
    await Promise.all([
      db
        .select({
          activeProducts: sql<number>`count(*) filter (where ${products.status} = 'ACTIVE')::int`,
          publicProducts: sql<number>`count(*) filter (where ${products.status} = 'ACTIVE' and ${products.isPublic} = true)::int`,
          withoutPartNumber: sql<number>`count(*) filter (where ${products.partNumber} is null)::int`,
          withoutImage: sql<number>`count(*) filter (where not exists (select 1 from ${productImages} pi where pi.product_id = ${products.id}))::int`,
        })
        .from(products)
        .where(isNull(products.deletedAt)),
      db
        .select({
          availableUnits: sql<number>`coalesce(sum(${inventoryItems.quantity}) filter (where ${inventoryItems.status} = 'AVAILABLE'), 0)::int`,
          reservedUnits: sql<number>`coalesce(sum(${inventoryItems.quantity}) filter (where ${inventoryItems.status} = 'RESERVED'), 0)::int`,
          soldUnits: sql<number>`coalesce((select sum(im.quantity) from ${inventoryMovements} im where im.type = 'SALE'), 0)::int`,
          unlocatedProducts: sql<number>`count(distinct ${inventoryItems.productId}) filter (where ${inventoryItems.locationId} is null and ${inventoryItems.quantity} > 0 and ${inventoryItems.status} in ('AVAILABLE', 'RESERVED', 'DAMAGED'))::int`,
        })
        .from(inventoryItems),
      db
        .select({
          id: inventoryMovements.id,
          type: inventoryMovements.type,
          quantity: inventoryMovements.quantity,
          reason: inventoryMovements.reason,
          createdAt: inventoryMovements.createdAt,
          inventoryCode: inventoryItems.inventoryCode,
          productTitle: products.title,
        })
        .from(inventoryMovements)
        .innerJoin(inventoryItems, eq(inventoryMovements.inventoryItemId, inventoryItems.id))
        .innerJoin(products, eq(inventoryItems.productId, products.id))
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(8),
      db
        .select({
          componentType: componentTypes.name,
          physicalStock: sql<number>`coalesce(sum(case when ${inventoryItems.status} in ('AVAILABLE', 'RESERVED', 'DAMAGED') then ${inventoryItems.quantity} else 0 end), 0)::int`,
          availableStock: sql<number>`coalesce(sum(case when ${inventoryItems.status} = 'AVAILABLE' then ${inventoryItems.quantity} else 0 end), 0)::int`,
        })
        .from(componentTypes)
        .leftJoin(products, and(eq(products.componentTypeId, componentTypes.id), isNull(products.deletedAt)))
        .leftJoin(inventoryItems, eq(inventoryItems.productId, products.id))
        .groupBy(componentTypes.id, componentTypes.name)
        .orderBy(desc(sql`coalesce(sum(${inventoryItems.quantity}), 0)`))
        .limit(8),
      db
        .select({
          id: products.id,
          sku: products.sku,
          title: products.title,
          status: products.status,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .where(isNull(products.deletedAt))
        .orderBy(desc(products.updatedAt))
        .limit(6),
      db
        .select({ id: importJobs.id, filename: importJobs.filename, status: importJobs.status, totalRows: importJobs.totalRows, successfulRows: importJobs.successfulRows, warningRows: importJobs.warningRows, failedRows: importJobs.failedRows, createdAt: importJobs.createdAt, completedAt: importJobs.completedAt })
        .from(importJobs)
        .orderBy(desc(importJobs.createdAt))
        .limit(1),
      db
        .select({ id: importJobs.id, filename: importJobs.filename, status: importJobs.status, failedRows: importJobs.failedRows, createdAt: importJobs.createdAt })
        .from(importJobs)
        .where(sql`${importJobs.failedRows} > 0 or ${importJobs.status} = 'FAILED'`)
        .orderBy(desc(importJobs.createdAt))
        .limit(4),
    ]);

  return {
    metrics: {
      activeProducts: productMetrics[0]?.activeProducts ?? 0,
      publicProducts: productMetrics[0]?.publicProducts ?? 0,
      availableUnits: inventoryMetrics[0]?.availableUnits ?? 0,
      reservedUnits: inventoryMetrics[0]?.reservedUnits ?? 0,
      soldUnits: inventoryMetrics[0]?.soldUnits ?? 0,
      unlocatedProducts: inventoryMetrics[0]?.unlocatedProducts ?? 0,
      withoutPartNumber: productMetrics[0]?.withoutPartNumber ?? 0,
      withoutImage: productMetrics[0]?.withoutImage ?? 0,
    },
    recentMovements,
    inventoryByType,
    recentProducts,
    latestImport: recentImports[0] ?? null,
    recentImportErrors,
  };
}
