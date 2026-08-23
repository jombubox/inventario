import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { inventoryItems, locations, products } from "@/db/schema";
import { buildLocationBreadcrumb } from "@/features/locations/domain/location-hierarchy";
import type { InventoryListQuery } from "@/validators/admin-query";

export async function listAdminInventory(db: Database, query: InventoryListQuery) {
  const conditions: SQL[] = [];
  if (query.q) {
    const pattern = `%${query.q}%`;
    conditions.push(
      or(
        ilike(inventoryItems.inventoryCode, pattern),
        ilike(products.sku, pattern),
        ilike(products.title, pattern),
      )!,
    );
  }
  if (query.condition) conditions.push(eq(inventoryItems.condition, query.condition));
  if (query.status) conditions.push(eq(inventoryItems.status, query.status));
  if (query.location) conditions.push(eq(locations.code, query.location));
  if (query.unlocated) conditions.push(isNull(inventoryItems.locationId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  const [rows, totalResult, locationNodes] = await Promise.all([
    db
      .select({
        id: inventoryItems.id,
        inventoryCode: inventoryItems.inventoryCode,
        productId: inventoryItems.productId,
        productTitle: products.title,
        sku: products.sku,
        quantity: inventoryItems.quantity,
        condition: inventoryItems.condition,
        status: inventoryItems.status,
        locationId: inventoryItems.locationId,
        locationName: locations.name,
        legacyBagNumber: inventoryItems.legacyBagNumber,
        legacyLocationCode: inventoryItems.legacyLocationCode,
        acquiredAt: inventoryItems.acquiredAt,
        acquisitionSource: inventoryItems.acquisitionSource,
        purchaseCost: inventoryItems.purchaseCost,
        notes: inventoryItems.notes,
        updatedAt: inventoryItems.updatedAt,
      })
      .from(inventoryItems)
      .innerJoin(products, eq(inventoryItems.productId, products.id))
      .leftJoin(locations, eq(inventoryItems.locationId, locations.id))
      .where(where)
      .orderBy(desc(inventoryItems.updatedAt))
      .limit(query.pageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(inventoryItems)
      .innerJoin(products, eq(inventoryItems.productId, products.id))
      .leftJoin(locations, eq(inventoryItems.locationId, locations.id))
      .where(where),
    db
      .select({ id: locations.id, name: locations.name, parentId: locations.parentId })
      .from(locations),
  ]);

  const rowsWithBreadcrumb = rows.map((row) => ({
    ...row,
    locationBreadcrumb: row.locationId
      ? buildLocationBreadcrumb(row.locationId, locationNodes)
      : null,
  }));
  const total = totalResult[0]?.value ?? 0;
  return {
    rows: rowsWithBreadcrumb,
    total,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function listInventoryFormOptions(db: Database) {
  const [productRows, locationNodes] = await Promise.all([
    db
      .select({ id: products.id, sku: products.sku, title: products.title })
      .from(products)
      .where(isNull(products.deletedAt))
      .orderBy(asc(products.title))
      .limit(500),
    db
      .select({
        id: locations.id,
        code: locations.code,
        name: locations.name,
        parentId: locations.parentId,
      })
      .from(locations)
      .where(eq(locations.active, true))
      .orderBy(asc(locations.name))
      .limit(1000),
  ]);

  return {
    products: productRows,
    locations: locationNodes.map((location) => ({
      ...location,
      breadcrumb: buildLocationBreadcrumb(location.id, locationNodes),
    })),
  };
}
