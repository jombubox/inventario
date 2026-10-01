import { asc, count, eq, ilike, or, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  brands,
  componentTypes,
  productCompatibilities,
  products,
} from "@/db/schema";

export async function listAdminBrands(db: Database, query = "") {
  const pattern = `%${query.trim()}%`;
  return db
    .select({
      id: brands.id,
      name: brands.name,
      code: brands.code,
      active: brands.active,
      updatedAt: brands.updatedAt,
      productCount: sql<number>`(
        select count(*)::int from ${products} p where p.brand_id = ${brands.id}
      )`,
      compatibilityCount: sql<number>`(
        select count(*)::int from ${productCompatibilities} pc where pc.brand_id = ${brands.id}
      )`,
    })
    .from(brands)
    .where(
      query.trim()
        ? or(ilike(brands.name, pattern), ilike(brands.code, pattern))
        : undefined,
    )
    .orderBy(asc(brands.name));
}

export async function listAdminComponentTypes(db: Database, query = "") {
  const pattern = `%${query.trim()}%`;
  return db
    .select({
      id: componentTypes.id,
      name: componentTypes.name,
      code: componentTypes.code,
      active: componentTypes.active,
      updatedAt: componentTypes.updatedAt,
      productCount: count(products.id),
    })
    .from(componentTypes)
    .leftJoin(products, eq(products.componentTypeId, componentTypes.id))
    .where(
      query.trim()
        ? or(ilike(componentTypes.name, pattern), ilike(componentTypes.code, pattern))
        : undefined,
    )
    .groupBy(componentTypes.id)
    .orderBy(asc(componentTypes.name));
}
