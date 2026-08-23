import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  brands,
  componentTypes,
  inventoryItems,
  productCompatibilities,
  productImages,
  products,
} from "@/db/schema";
import { getR2PublicUrl } from "@/features/images/server/r2-public-url";
import type { ProductListQuery } from "@/validators/admin-query";

export async function listProductCatalogOptions(db: Database) {
  const [brandRows, componentTypeRows] = await Promise.all([
    db
      .select({ id: brands.id, name: brands.name, code: brands.code, slug: brands.slug })
      .from(brands)
      .where(eq(brands.active, true))
      .orderBy(asc(brands.name)),
    db
      .select({
        id: componentTypes.id,
        name: componentTypes.name,
        code: componentTypes.code,
        slug: componentTypes.slug,
      })
      .from(componentTypes)
      .where(eq(componentTypes.active, true))
      .orderBy(asc(componentTypes.name)),
  ]);

  return { brands: brandRows, componentTypes: componentTypeRows };
}

export async function listAdminProducts(db: Database, query: ProductListQuery) {
  const stockSummary = db
    .select({
      productId: inventoryItems.productId,
      physicalStock: sql<number>`coalesce(sum(case when ${inventoryItems.status} in ('AVAILABLE', 'RESERVED', 'DAMAGED') then ${inventoryItems.quantity} else 0 end), 0)::int`.as(
        "physical_stock",
      ),
      availableStock: sql<number>`coalesce(sum(case when ${inventoryItems.status} = 'AVAILABLE' then ${inventoryItems.quantity} else 0 end), 0)::int`.as(
        "available_stock",
      ),
      unlocatedItems: sql<number>`count(*) filter (where ${inventoryItems.locationId} is null)::int`.as(
        "unlocated_items",
      ),
    })
    .from(inventoryItems)
    .groupBy(inventoryItems.productId)
    .as("stock_summary");

  const conditions: SQL[] = [isNull(products.deletedAt)];
  if (query.q) {
    const pattern = `%${query.q}%`;
    conditions.push(
      or(
        ilike(products.sku, pattern),
        ilike(products.title, pattern),
        ilike(products.partNumber, pattern),
        ilike(brands.name, pattern),
        sql`exists (select 1 from ${productCompatibilities} pc where pc.product_id = ${products.id} and pc.model ilike ${pattern})`,
      )!,
    );
  }
  if (query.brand) conditions.push(eq(brands.slug, query.brand));
  if (query.type) conditions.push(eq(componentTypes.slug, query.type));
  if (query.status) conditions.push(eq(products.status, query.status));
  if (query.public !== undefined) conditions.push(eq(products.isPublic, query.public));
  if (query.stock === "in-stock") {
    conditions.push(sql`coalesce(${stockSummary.physicalStock}, 0) > 0`);
  } else if (query.stock === "out-of-stock") {
    conditions.push(sql`coalesce(${stockSummary.physicalStock}, 0) = 0`);
  } else if (query.stock === "unlocated") {
    conditions.push(sql`coalesce(${stockSummary.unlocatedItems}, 0) > 0`);
  }

  const where = and(...conditions);
  const sortColumns = {
    updatedAt: products.updatedAt,
    title: products.title,
    sku: products.sku,
    createdAt: products.createdAt,
  } as const;
  const orderBy = query.direction === "asc" ? asc(sortColumns[query.sort]) : desc(sortColumns[query.sort]);
  const offset = (query.page - 1) * query.pageSize;

  const baseQuery = db
    .select({
      id: products.id,
      sku: products.sku,
      title: products.title,
      brand: brands.name,
      componentType: componentTypes.name,
      partNumber: products.partNumber,
      status: products.status,
      isPublic: products.isPublic,
      updatedAt: products.updatedAt,
      physicalStock: sql<number>`coalesce(${stockSummary.physicalStock}, 0)::int`,
      availableStock: sql<number>`coalesce(${stockSummary.availableStock}, 0)::int`,
      primaryImage: sql<string | null>`(
        select pi.storage_key
        from ${productImages} pi
        where pi.product_id = ${products.id}
          and pi.storage_key is not null
        order by pi.is_primary desc, pi.sort_order asc
        limit 1
      )`,
    })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .innerJoin(componentTypes, eq(products.componentTypeId, componentTypes.id))
    .leftJoin(stockSummary, eq(products.id, stockSummary.productId));

  const [rows, totalResult] = await Promise.all([
    baseQuery.where(where).orderBy(orderBy).limit(query.pageSize).offset(offset),
    db
      .select({ value: count() })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .innerJoin(componentTypes, eq(products.componentTypeId, componentTypes.id))
      .leftJoin(stockSummary, eq(products.id, stockSummary.productId))
      .where(where),
  ]);

  const total = totalResult[0]?.value ?? 0;
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
}

export async function getAdminProductDetail(db: Database, productId: string) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), isNull(products.deletedAt)),
    with: {
      brand: true,
      componentType: true,
      compatibilities: { with: { brand: true } },
      inventoryItems: { with: { location: true } },
      images: true,
    },
  });

  if (!product) return null;
  const physicalStock = product.inventoryItems
    .filter((item) => ["AVAILABLE", "RESERVED", "DAMAGED"].includes(item.status))
    .reduce((sum, item) => sum + item.quantity, 0);
  const availableStock = product.inventoryItems
    .filter((item) => item.status === "AVAILABLE")
    .reduce((sum, item) => sum + item.quantity, 0);

  return {
    ...product,
    images: product.images.map((image) => ({
      ...image,
      url: image.storageKey ? getR2PublicUrl(image.storageKey) : null,
    })),
    summary: {
      physicalStock,
      availableStock,
      inventoryItemCount: product.inventoryItems.length,
      locationCount: new Set(
        product.inventoryItems.map((item) => item.locationId).filter(Boolean),
      ).size,
    },
  };
}
