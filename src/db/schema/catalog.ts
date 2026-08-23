import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAtColumn, updatedAtColumn } from "@/db/schema/columns";

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    code: text("code").notNull(),
    slug: text("slug").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    unique("brands_normalized_name_unique").on(table.normalizedName),
    unique("brands_code_unique").on(table.code),
    unique("brands_slug_unique").on(table.slug),
    index("brands_active_idx").on(table.active),
    check("brands_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "brands_normalized_name_not_blank",
      sql`length(btrim(${table.normalizedName})) > 0`,
    ),
    check("brands_code_format", sql`${table.code} ~ '^[A-Z0-9]{2,8}$'`),
    check("brands_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
  ],
);

export const brandAliases = pgTable(
  "brand_aliases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade", onUpdate: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    unique("brand_aliases_normalized_alias_unique").on(table.normalizedAlias),
    index("brand_aliases_brand_id_idx").on(table.brandId),
    check("brand_aliases_alias_not_blank", sql`length(btrim(${table.alias})) > 0`),
    check(
      "brand_aliases_normalized_alias_not_blank",
      sql`length(btrim(${table.normalizedAlias})) > 0`,
    ),
  ],
);

export const componentTypes = pgTable(
  "component_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    code: text("code").notNull(),
    slug: text("slug").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    unique("component_types_normalized_name_unique").on(table.normalizedName),
    unique("component_types_code_unique").on(table.code),
    unique("component_types_slug_unique").on(table.slug),
    index("component_types_active_idx").on(table.active),
    check("component_types_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "component_types_normalized_name_not_blank",
      sql`length(btrim(${table.normalizedName})) > 0`,
    ),
    check("component_types_code_format", sql`${table.code} ~ '^[A-Z0-9]{2,8}$'`),
    check(
      "component_types_slug_format",
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
  ],
);

export const componentTypeAliases = pgTable(
  "component_type_aliases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    componentTypeId: uuid("component_type_id")
      .notNull()
      .references(() => componentTypes.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    unique("component_type_aliases_normalized_alias_unique").on(table.normalizedAlias),
    index("component_type_aliases_component_type_id_idx").on(table.componentTypeId),
    check(
      "component_type_aliases_alias_not_blank",
      sql`length(btrim(${table.alias})) > 0`,
    ),
    check(
      "component_type_aliases_normalized_alias_not_blank",
      sql`length(btrim(${table.normalizedAlias})) > 0`,
    ),
  ],
);
