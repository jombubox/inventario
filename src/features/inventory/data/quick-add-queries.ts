import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  brands,
  componentTypes,
  locations,
  productCompatibilities,
  productSerialNumbers,
  products,
} from "@/db/schema";
import { buildLocationBreadcrumb } from "@/features/locations/domain/location-hierarchy";
import { normalizeSerialNumber } from "@/features/products/domain/serial-number";
import { normalizeIdentifier } from "@/features/shared/domain/text-normalization";

export type QuickAddProductResult = {
  id: string;
  sku: string;
  title: string;
  partNumber: string | null;
  brand: string;
  componentType: string;
  compatibleModel: string | null;
  primarySerialNumber: string | null;
  secondarySerialCount: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
};

export async function listQuickAddOptions(db: Database) {
  const [brandRows, componentTypeRows, locationRows] = await Promise.all([
    db
      .select({ id: brands.id, name: brands.name, code: brands.code })
      .from(brands)
      .where(eq(brands.active, true))
      .orderBy(asc(brands.name)),
    db
      .select({ id: componentTypes.id, name: componentTypes.name, code: componentTypes.code })
      .from(componentTypes)
      .where(eq(componentTypes.active, true))
      .orderBy(asc(componentTypes.name)),
    db
      .select({
        id: locations.id,
        code: locations.code,
        name: locations.name,
        type: locations.type,
        parentId: locations.parentId,
      })
      .from(locations)
      .where(eq(locations.active, true))
      .orderBy(asc(locations.name))
      .limit(1_000),
  ]);

  return {
    brands: brandRows,
    componentTypes: componentTypeRows,
    locations: locationRows
      .filter((location) => location.type !== "BOX" && location.type !== "BAG")
      .map((location) => ({
        id: location.id,
        code: location.code,
        name: location.name,
        breadcrumb: buildLocationBreadcrumb(location.id, locationRows),
      })),
    boxes: locationRows
      .filter((location) => location.type === "BOX" && location.parentId)
      .map((location) => ({
        id: location.id,
        code: location.code,
        name: location.name,
        parentId: location.parentId!,
        breadcrumb: buildLocationBreadcrumb(location.id, locationRows),
      })),
  };
}

export async function searchInventoryModels(
  db: Database,
  rawQuery: string,
): Promise<QuickAddProductResult[]> {
  const query = rawQuery.trim();
  const pattern = `%${query}%`;
  const normalized = normalizeIdentifier(query);
  const normalizedPattern = `%${normalized}%`;
  const normalizedSerial = normalizeSerialNumber(query);
  const compatibilityMatch = normalized
    ? sql`exists (
        select 1 from ${productCompatibilities} pc
        where pc.product_id = ${products.id}
          and (pc.model ilike ${pattern} or pc.normalized_model ilike ${normalizedPattern})
      )`
    : sql`exists (
        select 1 from ${productCompatibilities} pc
        where pc.product_id = ${products.id} and pc.model ilike ${pattern}
      )`;

  return db
    .select({
      id: products.id,
      sku: products.sku,
      title: products.title,
      partNumber: products.partNumber,
      brand: brands.name,
      componentType: componentTypes.name,
      compatibleModel: sql<string | null>`(
        select pc.model
        from ${productCompatibilities} pc
        where pc.product_id = ${products.id}
        order by pc.created_at asc
        limit 1
      )`,
      primarySerialNumber: sql<string | null>`(
        select psn.serial_number
        from ${productSerialNumbers} psn
        where psn.product_id = ${products.id} and psn.kind = 'PRIMARY'
        limit 1
      )`,
      secondarySerialCount: sql<number>`(
        select count(*)::int
        from ${productSerialNumbers} psn
        where psn.product_id = ${products.id} and psn.kind = 'SECONDARY'
      )`,
      status: products.status,
    })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .innerJoin(componentTypes, eq(products.componentTypeId, componentTypes.id))
    .where(
      and(
        isNull(products.deletedAt),
        or(
          ilike(products.sku, pattern),
          ilike(products.title, pattern),
          ilike(products.partNumber, pattern),
          ilike(brands.name, pattern),
          ilike(componentTypes.name, pattern),
          normalized
            ? ilike(products.normalizedPartNumber, normalizedPattern)
            : undefined,
          sql`exists (
            select 1 from ${productSerialNumbers} psn
            where psn.product_id = ${products.id}
              and (psn.serial_number ilike ${pattern}
                or psn.normalized_serial_number ilike ${`%${normalizedSerial}%`})
          )`,
          compatibilityMatch,
        ),
      ),
    )
    .orderBy(
      sql`case
        when upper(${products.sku}) = upper(${query}) then 0
        when ${products.normalizedPartNumber} = ${normalized || "__none__"} then 1
        when exists (
          select 1 from ${productSerialNumbers} psn
          where psn.product_id = ${products.id}
            and psn.normalized_serial_number = ${normalizedSerial}
        ) then 2
        when ${products.title} ilike ${`${query}%`} then 3
        else 4
      end`,
      asc(products.title),
    )
    .limit(10);
}
