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
import {
  isQuickAddBox,
  isQuickAddContainer,
  isUnparentedQuickAddBox,
  UNPARENTED_BOXES_LOCATION_ID,
} from "@/features/locations/domain/quick-add-location";
import { normalizeModel } from "@/features/products/domain/product-normalization";
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
        active: locations.active,
        updatedAt: locations.updatedAt,
      })
      .from(locations)
      .orderBy(asc(locations.name))
      .limit(1_000),
  ]);

  const locationById = new Map(locationRows.map((location) => [location.id, location]));
  const containers = locationRows.filter(isQuickAddContainer);
  const boxes = locationRows.filter((location) => {
    if (!isQuickAddBox(location)) return false;
    const parent = location.parentId ? locationById.get(location.parentId) : undefined;
    return parent ? isQuickAddContainer(parent) : false;
  });
  const unparentedBoxes = locationRows.filter(isUnparentedQuickAddBox);
  const physicalLocations = locationRows.filter(
    (location) => location.type !== "BOX" && location.type !== "BAG",
  );

  return {
    brands: brandRows,
    componentTypes: componentTypeRows,
    locationAvailability: {
      total: physicalLocations.length,
      active: containers.length,
      inactive: physicalLocations.length - containers.length,
      unparentedBoxes: unparentedBoxes.length,
    },
    locations: [
      ...containers
      .map((location) => ({
        id: location.id,
        code: location.code,
        name: location.name,
        breadcrumb: buildLocationBreadcrumb(location.id, locationRows),
        kind: "container" as const,
        updatedAt: location.updatedAt.toISOString(),
      })),
      ...(unparentedBoxes.length > 0
        ? [{
            id: UNPARENTED_BOXES_LOCATION_ID,
            code: "",
            name: "Cajas sin ubicación padre",
            breadcrumb: "Cajas sin ubicación padre",
            kind: "unparented-boxes" as const,
          }]
        : []),
    ],
    boxes: [
      ...boxes
      .map((location) => ({
        id: location.id,
        code: location.code,
        name: location.name,
        parentId: location.parentId!,
        breadcrumb: buildLocationBreadcrumb(location.id, locationRows),
      })),
      ...unparentedBoxes.map((location) => ({
        id: location.id,
        code: location.code,
        name: location.name,
        parentId: UNPARENTED_BOXES_LOCATION_ID,
        breadcrumb: location.name,
      })),
    ],
  };
}

export type CompatibleModelSearchResult = {
  brandId: string;
  brandName: string;
  model: string;
  normalizedModel: string;
};

export async function searchCompatibleModels(
  db: Database,
  rawQuery: string,
): Promise<CompatibleModelSearchResult[]> {
  const query = rawQuery.trim();
  const pattern = `%${query}%`;
  const normalized = normalizeModel(query);
  const normalizedPattern = `%${normalized}%`;

  return db
    .select({
      brandId: productCompatibilities.brandId,
      brandName: brands.name,
      model: sql<string>`min(${productCompatibilities.model})`,
      normalizedModel: productCompatibilities.normalizedModel,
    })
    .from(productCompatibilities)
    .innerJoin(brands, eq(productCompatibilities.brandId, brands.id))
    .where(
      and(
        eq(brands.active, true),
        or(
          ilike(productCompatibilities.model, pattern),
          normalized
            ? ilike(productCompatibilities.normalizedModel, normalizedPattern)
            : undefined,
          ilike(brands.name, pattern),
        ),
      ),
    )
    .groupBy(
      productCompatibilities.brandId,
      brands.name,
      productCompatibilities.normalizedModel,
    )
    .orderBy(asc(brands.name), sql`min(${productCompatibilities.model})`)
    .limit(12);
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
