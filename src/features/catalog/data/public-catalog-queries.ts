import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNull,
  lte,
  ne,
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
import {
  getPublicAvailability,
  LOW_STOCK_THRESHOLD,
  publicConditionValues,
  type PublicCondition,
} from "@/features/catalog/domain/catalog";
import type { CatalogSearchParams } from "@/features/catalog/domain/catalog-query";
import { getR2PublicUrl } from "@/features/images/server/r2-public-url";
import {
  normalizeModel,
  normalizeSkuToken,
} from "@/features/products/domain/product-normalization";
import { normalizeComparableText } from "@/features/shared/domain/text-normalization";

export const PUBLIC_CATALOG_PAGE_SIZE = 24;

export type PublicCatalogOptionDTO = {
  slug: string;
  name: string;
  productCount: number;
};

export type PublicProductImageDTO = {
  url: string;
  alt: string;
};

export type PublicCompatibilityDTO = {
  brand: string;
  model: string;
};

export type PublicProductCardDTO = {
  slug: string;
  sku: string;
  title: string;
  brand: { name: string; slug: string };
  componentType: { name: string; slug: string };
  partNumber: string | null;
  salePrice: string | null;
  currency: string;
  primaryImage: PublicProductImageDTO | null;
  compatibilityPreview: PublicCompatibilityDTO | null;
  compatibilityCount: number;
  availability: ReturnType<typeof getPublicAvailability>;
  conditions: PublicCondition[];
};

export type PublicProductDetailDTO = Omit<
  PublicProductCardDTO,
  "compatibilityPreview" | "compatibilityCount"
> & {
  description: string | null;
  images: PublicProductImageDTO[];
  compatibilities: PublicCompatibilityDTO[];
  updatedAt: Date;
};

type PublicCardRow = {
  slug: string;
  sku: string;
  title: string;
  brandName: string;
  brandSlug: string;
  componentTypeName: string;
  componentTypeSlug: string;
  partNumber: string | null;
  salePrice: string | null;
  currency: string;
  primaryImageStorageKey: string | null;
  primaryImageAlt: string | null;
  compatibilityBrand: string | null;
  compatibilityModel: string | null;
  compatibilityCount: number;
  availableStock: number;
  conditions: string[];
};

const publicProductPredicate = and(
  eq(products.status, "ACTIVE"),
  eq(products.isPublic, true),
  isNull(products.deletedAt),
);

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}

function safeConditions(values: string[] | null): PublicCondition[] {
  if (!Array.isArray(values)) return [];
  const allowed = new Set<string>(publicConditionValues);
  return values.filter((value): value is PublicCondition => allowed.has(value));
}

function toPublicCard(row: PublicCardRow): PublicProductCardDTO {
  return {
    slug: row.slug,
    sku: row.sku,
    title: row.title,
    brand: { name: row.brandName, slug: row.brandSlug },
    componentType: { name: row.componentTypeName, slug: row.componentTypeSlug },
    partNumber: row.partNumber,
    salePrice: row.salePrice,
    currency: row.currency,
    primaryImage: row.primaryImageStorageKey
      ? {
          url: getR2PublicUrl(row.primaryImageStorageKey),
          alt: row.primaryImageAlt?.trim() || row.title,
        }
      : null,
    compatibilityPreview:
      row.compatibilityBrand && row.compatibilityModel
        ? { brand: row.compatibilityBrand, model: row.compatibilityModel }
        : null,
    compatibilityCount: row.compatibilityCount,
    availability: getPublicAvailability(row.availableStock),
    conditions: safeConditions(row.conditions),
  };
}

function stockSummary(db: Database) {
  return db
    .select({
      productId: inventoryItems.productId,
      availableStock:
        sql<number>`coalesce(sum(${inventoryItems.quantity}) filter (where ${inventoryItems.status} = 'AVAILABLE'), 0)::int`.as(
          "available_stock",
        ),
      conditions:
        sql<string[]>`coalesce(array_agg(distinct ${inventoryItems.condition}::text) filter (where ${inventoryItems.status} = 'AVAILABLE' and ${inventoryItems.quantity} > 0), '{}'::text[])`.as(
          "available_conditions",
        ),
    })
    .from(inventoryItems)
    .groupBy(inventoryItems.productId)
    .as("public_stock_summary");
}

function cardSelection(stock: ReturnType<typeof stockSummary>) {
  return {
    slug: products.slug,
    sku: products.sku,
    title: products.title,
    brandName: brands.name,
    brandSlug: brands.slug,
    componentTypeName: componentTypes.name,
    componentTypeSlug: componentTypes.slug,
    partNumber: products.partNumber,
    salePrice: products.salePrice,
    currency: products.currency,
    primaryImageStorageKey: sql<string | null>`(
      select pi.storage_key
      from ${productImages} pi
      where pi.product_id = ${products.id}
        and pi.storage_key is not null
      order by pi.is_primary desc, pi.sort_order asc, pi.created_at asc
      limit 1
    )`,
    primaryImageAlt: sql<string | null>`(
      select pi.alt
      from ${productImages} pi
      where pi.product_id = ${products.id}
        and pi.storage_key is not null
      order by pi.is_primary desc, pi.sort_order asc, pi.created_at asc
      limit 1
    )`,
    compatibilityBrand: sql<string | null>`(
      select cb.name
      from ${productCompatibilities} pc
      join ${brands} cb on cb.id = pc.brand_id
      where pc.product_id = ${products.id}
      order by cb.name asc, pc.model asc
      limit 1
    )`,
    compatibilityModel: sql<string | null>`(
      select pc.model
      from ${productCompatibilities} pc
      join ${brands} cb on cb.id = pc.brand_id
      where pc.product_id = ${products.id}
      order by cb.name asc, pc.model asc
      limit 1
    )`,
    compatibilityCount: sql<number>`(
      select count(*)::int
      from ${productCompatibilities} pc
      where pc.product_id = ${products.id}
    )`,
    availableStock: sql<number>`coalesce(${stock.availableStock}, 0)::int`,
    conditions: sql<string[]>`coalesce(${stock.conditions}, '{}'::text[])`,
  };
}

function searchPredicate(query: CatalogSearchParams): SQL | undefined {
  if (!query.q) return undefined;
  const rawPattern = `%${escapeLike(query.q)}%`;
  const normalized = normalizeSkuToken(query.q);

  return or(
    sql`${products.sku} ilike ${rawPattern} escape '\\'`,
    sql`${products.title} ilike ${rawPattern} escape '\\'`,
    sql`${products.partNumber} ilike ${rawPattern} escape '\\'`,
    sql`${brands.name} ilike ${rawPattern} escape '\\'`,
    sql`${componentTypes.name} ilike ${rawPattern} escape '\\'`,
    sql`exists (
      select 1 from ${productCompatibilities} pc
      where pc.product_id = ${products.id}
        and (pc.model ilike ${rawPattern} escape '\\'
          or (${normalized !== ""} and pc.normalized_model like ${`%${normalized}%`}))
    )`,
    normalized
      ? sql`regexp_replace(upper(${products.sku}), '[^A-Z0-9]', '', 'g') like ${`%${normalized}%`}`
      : undefined,
    normalized ? sql`${products.normalizedPartNumber} like ${`%${normalized}%`}` : undefined,
  );
}

function searchRank(query: CatalogSearchParams): SQL<number> | undefined {
  if (!query.q) return undefined;
  const normalized = normalizeSkuToken(query.q);
  const comparable = normalizeComparableText(query.q);
  const rawPrefix = `${escapeLike(query.q)}%`;

  return sql<number>`case
    when upper(${products.sku}) = upper(${query.q})
      or (${normalized !== ""} and regexp_replace(upper(${products.sku}), '[^A-Z0-9]', '', 'g') = ${normalized}) then 0
    when ${normalized !== ""} and ${products.normalizedPartNumber} = ${normalized} then 1
    when ${normalized !== ""} and exists (
      select 1 from ${productCompatibilities} pc
      where pc.product_id = ${products.id} and pc.normalized_model = ${normalized}
    ) then 2
    when ${products.sku} ilike ${rawPrefix} escape '\\'
      or (${normalized !== ""} and ${products.normalizedPartNumber} like ${`${normalized}%`})
      or (${normalized !== ""} and exists (
        select 1 from ${productCompatibilities} pc
        where pc.product_id = ${products.id} and pc.normalized_model like ${`${normalized}%`}
      )) then 3
    when ${brands.normalizedName} = ${comparable}
      or ${componentTypes.normalizedName} = ${comparable} then 4
    when ${products.title} ilike ${`%${escapeLike(query.q)}%`} escape '\\' then 5
    else 6
  end`;
}

function buildPredicates(
  query: CatalogSearchParams,
  stock: ReturnType<typeof stockSummary>,
): SQL[] {
  const predicates: SQL[] = [publicProductPredicate!];
  const search = searchPredicate(query);
  if (search) predicates.push(search);
  if (query.marca) predicates.push(eq(brands.slug, query.marca));
  if (query.tipo) predicates.push(eq(componentTypes.slug, query.tipo));
  if (query.modelo) {
    const rawPattern = `%${escapeLike(query.modelo)}%`;
    const normalized = normalizeModel(query.modelo);
    predicates.push(sql`exists (
      select 1 from ${productCompatibilities} pc
      where pc.product_id = ${products.id}
        and (pc.model ilike ${rawPattern} escape '\\'
          or (${normalized !== ""} and pc.normalized_model like ${`%${normalized}%`}))
    )`);
  }
  if (query.condicion) {
    predicates.push(sql`exists (
      select 1 from ${inventoryItems} ii
      where ii.product_id = ${products.id}
        and ii.status = 'AVAILABLE'
        and ii.quantity > 0
        and ii.condition = ${query.condicion}
    )`);
  }
  if (query.disponibilidad === "disponible") {
    predicates.push(sql`coalesce(${stock.availableStock}, 0) > ${LOW_STOCK_THRESHOLD}`);
  } else if (query.disponibilidad === "pocas") {
    predicates.push(
      sql`coalesce(${stock.availableStock}, 0) between 1 and ${LOW_STOCK_THRESHOLD}`,
    );
  } else if (query.disponibilidad === "agotado") {
    predicates.push(sql`coalesce(${stock.availableStock}, 0) <= 0`);
  }
  if (query.precioMin !== undefined) {
    predicates.push(gte(products.salePrice, query.precioMin.toFixed(2)));
  }
  if (query.precioMax !== undefined) {
    predicates.push(lte(products.salePrice, query.precioMax.toFixed(2)));
  }
  return predicates;
}

function catalogOrder(query: CatalogSearchParams): SQL[] {
  const rank = searchRank(query);
  const selected = (() => {
    switch (query.sort) {
      case "nombre-asc":
        return [asc(products.title), asc(products.sku)];
      case "nombre-desc":
        return [desc(products.title), asc(products.sku)];
      case "precio-asc":
        return [sql`${products.salePrice} asc nulls last`, asc(products.title)];
      case "precio-desc":
        return [sql`${products.salePrice} desc nulls last`, asc(products.title)];
      default:
        return [desc(products.updatedAt), asc(products.title)];
    }
  })();
  return rank && query.sort === "recientes" ? [asc(rank), ...selected] : selected;
}

export async function getPublicProducts(
  db: Database,
  query: CatalogSearchParams,
  options: { pageSize?: number } = {},
) {
  const pageSize = Math.min(Math.max(options.pageSize ?? PUBLIC_CATALOG_PAGE_SIZE, 1), 24);
  const stock = stockSummary(db);
  const where = and(...buildPredicates(query, stock));
  const offset = (query.page - 1) * pageSize;

  const selectPage = (rowOffset: number) =>
    db
      .select(cardSelection(stock))
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .innerJoin(componentTypes, eq(products.componentTypeId, componentTypes.id))
      .leftJoin(stock, eq(products.id, stock.productId))
      .where(where)
      .orderBy(...catalogOrder(query))
      .limit(pageSize)
      .offset(rowOffset);

  const [initialRows, totalRows] = await Promise.all([
    selectPage(offset),
    db
      .select({ value: count() })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .innerJoin(componentTypes, eq(products.componentTypeId, componentTypes.id))
      .leftJoin(stock, eq(products.id, stock.productId))
      .where(where),
  ]);

  let rows = initialRows;
  const total = totalRows[0]?.value ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(query.page, pageCount);
  if (page !== query.page && total > 0) rows = await selectPage((page - 1) * pageSize);
  return {
    products: (rows as PublicCardRow[]).map(toPublicCard),
    total,
    page,
    pageSize,
    pageCount,
  };
}

export async function getPublicBrands(db: Database): Promise<PublicCatalogOptionDTO[]> {
  const rows = await db
    .select({
      slug: brands.slug,
      name: brands.name,
      productCount: sql<number>`count(${products.id})::int`,
    })
    .from(brands)
    .innerJoin(products, eq(products.brandId, brands.id))
    .where(publicProductPredicate)
    .groupBy(brands.id, brands.slug, brands.name)
    .orderBy(asc(brands.name));
  return rows;
}

export async function getPublicComponentTypes(
  db: Database,
): Promise<PublicCatalogOptionDTO[]> {
  const rows = await db
    .select({
      slug: componentTypes.slug,
      name: componentTypes.name,
      productCount: sql<number>`count(${products.id})::int`,
    })
    .from(componentTypes)
    .innerJoin(products, eq(products.componentTypeId, componentTypes.id))
    .where(publicProductPredicate)
    .groupBy(componentTypes.id, componentTypes.slug, componentTypes.name)
    .orderBy(asc(componentTypes.name));
  return rows;
}

export async function getPublicProductBySlug(
  db: Database,
  slug: string,
): Promise<PublicProductDetailDTO | null> {
  const stock = stockSummary(db);
  const [row] = await db
    .select({
      ...cardSelection(stock),
      description: products.description,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .innerJoin(componentTypes, eq(products.componentTypeId, componentTypes.id))
    .leftJoin(stock, eq(products.id, stock.productId))
    .where(and(publicProductPredicate, eq(products.slug, slug)))
    .limit(1);

  if (!row) return null;

  const [imageRows, compatibilityRows] = await Promise.all([
    db
      .select({ storageKey: productImages.storageKey, alt: productImages.alt })
      .from(productImages)
      .innerJoin(products, eq(productImages.productId, products.id))
      .where(
        and(
          publicProductPredicate,
          eq(products.slug, slug),
          sql`${productImages.storageKey} is not null`,
        ),
      )
      .orderBy(desc(productImages.isPrimary), asc(productImages.sortOrder), asc(productImages.createdAt)),
    db
      .select({ brand: brands.name, model: productCompatibilities.model })
      .from(productCompatibilities)
      .innerJoin(products, eq(productCompatibilities.productId, products.id))
      .innerJoin(brands, eq(productCompatibilities.brandId, brands.id))
      .where(and(publicProductPredicate, eq(products.slug, slug)))
      .orderBy(asc(brands.name), asc(productCompatibilities.model)),
  ]);

  const card = toPublicCard(row as PublicCardRow);
  return {
    ...card,
    description: row.description,
    images: imageRows.flatMap((image) =>
      image.storageKey
        ? [{ url: getR2PublicUrl(image.storageKey), alt: image.alt?.trim() || row.title }]
        : [],
    ),
    compatibilities: compatibilityRows,
    updatedAt: row.updatedAt,
  };
}

export async function getRelatedProducts(
  db: Database,
  product: PublicProductDetailDTO,
  limit = 6,
): Promise<PublicProductCardDTO[]> {
  const stock = stockSummary(db);
  const normalizedModels = product.compatibilities.map(({ model }) => normalizeModel(model));
  const relation = or(
    eq(brands.slug, product.brand.slug),
    eq(componentTypes.slug, product.componentType.slug),
    normalizedModels.length > 0
      ? sql`exists (
          select 1 from ${productCompatibilities} pc
          where pc.product_id = ${products.id}
            and pc.normalized_model in (${sql.join(
              normalizedModels.map((model) => sql`${model}`),
              sql`, `,
            )})
        )`
      : undefined,
  );
  const compatibilityScore =
    normalizedModels.length > 0
      ? sql<number>`case when exists (
          select 1 from ${productCompatibilities} pc
          where pc.product_id = ${products.id}
            and pc.normalized_model in (${sql.join(
              normalizedModels.map((model) => sql`${model}`),
              sql`, `,
            )})
        ) then 1 else 0 end`
      : sql<number>`0`;
  const score = sql<number>`(
    case when ${componentTypes.slug} = ${product.componentType.slug} then 4 else 0 end
    + case when ${brands.slug} = ${product.brand.slug} then 2 else 0 end
    + ${compatibilityScore}
  )`;

  const rows = await db
    .select(cardSelection(stock))
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .innerJoin(componentTypes, eq(products.componentTypeId, componentTypes.id))
    .leftJoin(stock, eq(products.id, stock.productId))
    .where(and(publicProductPredicate, ne(products.slug, product.slug), relation))
    .orderBy(desc(score), desc(products.updatedAt), asc(products.title))
    .limit(Math.min(Math.max(limit, 4), 8));

  return (rows as PublicCardRow[]).map(toPublicCard);
}

export async function getPublicProductSitemapEntries(db: Database) {
  return db
    .select({ slug: products.slug, updatedAt: products.updatedAt })
    .from(products)
    .where(publicProductPredicate)
    .orderBy(asc(products.slug));
}
