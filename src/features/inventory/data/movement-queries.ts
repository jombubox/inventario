import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "@/db/connection";
import { inventoryItems, inventoryMovements, locations, products, user } from "@/db/schema";
import { buildLocationBreadcrumb } from "@/features/locations/domain/location-hierarchy";
import type { MovementListQuery } from "@/validators/admin-query";

export async function listInventoryMovements(db: Database, query: MovementListQuery) {
  const fromLocation = alias(locations, "movement_from_location");
  const toLocation = alias(locations, "movement_to_location");
  const conditions: SQL[] = [];
  if (query.q) {
    const pattern = `%${query.q}%`;
    conditions.push(or(ilike(inventoryItems.inventoryCode, pattern), ilike(products.sku, pattern), ilike(products.title, pattern), ilike(inventoryMovements.reason, pattern))!);
  }
  if (query.type) conditions.push(eq(inventoryMovements.type, query.type));
  if (query.userId) conditions.push(eq(inventoryMovements.userId, query.userId));
  if (query.location) conditions.push(or(eq(fromLocation.code, query.location), eq(toLocation.code, query.location))!);
  if (query.from) conditions.push(sql`${inventoryMovements.createdAt} >= (${query.from}::date::timestamp at time zone 'America/Mexico_City')`);
  if (query.to) conditions.push(sql`${inventoryMovements.createdAt} < ((${query.to}::date + 1)::timestamp at time zone 'America/Mexico_City')`);
  const where = conditions.length ? and(...conditions) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  const base = db
    .select({
      id: inventoryMovements.id,
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity,
      reason: inventoryMovements.reason,
      metadata: inventoryMovements.metadata,
      createdAt: inventoryMovements.createdAt,
      inventoryItemId: inventoryItems.id,
      inventoryCode: inventoryItems.inventoryCode,
      sku: products.sku,
      productTitle: products.title,
      fromLocationId: fromLocation.id,
      fromLocationCode: fromLocation.code,
      toLocationId: toLocation.id,
      toLocationCode: toLocation.code,
      userName: user.name,
      userEmail: user.email,
    })
    .from(inventoryMovements)
    .innerJoin(inventoryItems, eq(inventoryMovements.inventoryItemId, inventoryItems.id))
    .innerJoin(products, eq(inventoryItems.productId, products.id))
    .leftJoin(fromLocation, eq(inventoryMovements.fromLocationId, fromLocation.id))
    .leftJoin(toLocation, eq(inventoryMovements.toLocationId, toLocation.id))
    .leftJoin(user, eq(inventoryMovements.userId, user.id));

  const [rows, totalResult, locationNodes, users] = await Promise.all([
    base.where(where).orderBy(desc(inventoryMovements.createdAt)).limit(query.pageSize).offset(offset),
    db.select({ value: count() }).from(inventoryMovements).innerJoin(inventoryItems, eq(inventoryMovements.inventoryItemId, inventoryItems.id)).innerJoin(products, eq(inventoryItems.productId, products.id)).leftJoin(fromLocation, eq(inventoryMovements.fromLocationId, fromLocation.id)).leftJoin(toLocation, eq(inventoryMovements.toLocationId, toLocation.id)).leftJoin(user, eq(inventoryMovements.userId, user.id)).where(where),
    db.select({ id: locations.id, code: locations.code, name: locations.name, parentId: locations.parentId }).from(locations),
    db.select({ id: user.id, name: user.name, email: user.email }).from(user).orderBy(asc(user.name)),
  ]);
  const locationById = new Map(locationNodes.map((node) => [node.id, node]));
  const decorated = rows.map((row) => ({
    ...row,
    fromLocation: row.fromLocationId && locationById.has(row.fromLocationId) ? buildLocationBreadcrumb(row.fromLocationId, locationNodes) : row.fromLocationCode,
    toLocation: row.toLocationId && locationById.has(row.toLocationId) ? buildLocationBreadcrumb(row.toLocationId, locationNodes) : row.toLocationCode,
  }));
  const total = totalResult[0]?.value ?? 0;
  return {
    rows: decorated,
    total,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    options: { locations: locationNodes, users },
  };
}
