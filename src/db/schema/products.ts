import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { brands, componentTypes } from "@/db/schema/catalog";
import { createdAtColumn, updatedAtColumn } from "@/db/schema/columns";
import { productStatusEnum } from "@/db/schema/enums";

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sku: text("sku").notNull(),
    slug: text("slug").notNull(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict", onUpdate: "cascade" }),
    componentTypeId: uuid("component_type_id")
      .notNull()
      .references(() => componentTypes.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    partNumber: text("part_number"),
    normalizedPartNumber: text("normalized_part_number"),
    title: text("title").notNull(),
    description: text("description"),
    salePrice: numeric("sale_price", { precision: 12, scale: 2, mode: "string" }),
    currency: char("currency", { length: 3 }).default("MXN").notNull(),
    status: productStatusEnum("status").default("DRAFT").notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    unique("products_sku_unique").on(table.sku),
    unique("products_slug_unique").on(table.slug),
    index("products_brand_id_idx").on(table.brandId),
    index("products_component_type_id_idx").on(table.componentTypeId),
    index("products_normalized_part_number_idx").on(table.normalizedPartNumber),
    index("products_duplicate_candidate_idx")
      .on(table.brandId, table.componentTypeId, table.normalizedPartNumber)
      .where(sql`${table.normalizedPartNumber} is not null and ${table.deletedAt} is null`),
    index("products_public_catalog_idx")
      .on(table.status, table.isPublic)
      .where(sql`${table.deletedAt} is null`),
    index("products_public_updated_at_idx")
      .on(table.updatedAt.desc())
      .where(
        sql`${table.status} = 'ACTIVE' and ${table.isPublic} = true and ${table.deletedAt} is null`,
      ),
    check("products_sku_format", sql`${table.sku} ~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'`),
    check("products_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check("products_title_not_blank", sql`length(btrim(${table.title})) > 0`),
    check(
      "products_part_number_pair",
      sql`(${table.partNumber} is null and ${table.normalizedPartNumber} is null) or (${table.partNumber} is not null and ${table.normalizedPartNumber} is not null and length(btrim(${table.normalizedPartNumber})) > 0)`,
    ),
    check("products_sale_price_non_negative", sql`${table.salePrice} is null or ${table.salePrice} >= 0`),
    check("products_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const productCompatibilities = pgTable(
  "product_compatibilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade", onUpdate: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict", onUpdate: "cascade" }),
    model: text("model").notNull(),
    normalizedModel: text("normalized_model").notNull(),
    notes: text("notes"),
    createdAt: createdAtColumn(),
  },
  (table) => [
    unique("product_compatibilities_product_brand_model_unique").on(
      table.productId,
      table.brandId,
      table.normalizedModel,
    ),
    index("product_compatibilities_brand_id_idx").on(table.brandId),
    index("product_compatibilities_normalized_model_idx").on(table.normalizedModel),
    check("product_compatibilities_model_not_blank", sql`length(btrim(${table.model})) > 0`),
    check(
      "product_compatibilities_normalized_model_not_blank",
      sql`length(btrim(${table.normalizedModel})) > 0`,
    ),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade", onUpdate: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id"),
    storageKey: text("storage_key"),
    url: text("url"),
    alt: text("alt"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("product_images_product_sort_idx").on(table.productId, table.sortOrder),
    uniqueIndex("product_images_one_primary_per_product")
      .on(table.productId)
      .where(sql`${table.isPrimary} = true`),
    uniqueIndex("product_images_provider_external_id_unique")
      .on(table.provider, table.externalId)
      .where(sql`${table.externalId} is not null`),
    check("product_images_provider_not_blank", sql`length(btrim(${table.provider})) > 0`),
    check("product_images_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
    check(
      "product_images_locator_required",
      sql`num_nonnulls(${table.externalId}, ${table.storageKey}, ${table.url}) >= 1`,
    ),
  ],
);
