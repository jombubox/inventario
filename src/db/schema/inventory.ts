import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAtColumn, updatedAtColumn } from "@/db/schema/columns";
import { user } from "@/db/schema/auth";
import {
  inventoryConditionEnum,
  inventoryMovementTypeEnum,
  inventoryStatusEnum,
} from "@/db/schema/enums";
import { locations } from "@/db/schema/locations";
import { products } from "@/db/schema/products";

export const inventoryCodeSequence = pgSequence("inventory_code_seq", {
  startWith: 1,
  increment: 1,
  minValue: 1,
  cache: 1,
  cycle: false,
});

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inventoryCode: text("inventory_code")
      .default(sql`'INV-' || lpad(nextval('inventory_code_seq')::text, 6, '0')`)
      .notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict", onUpdate: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    quantity: integer("quantity").default(1).notNull(),
    condition: inventoryConditionEnum("condition").default("UNKNOWN").notNull(),
    status: inventoryStatusEnum("status").default("AVAILABLE").notNull(),
    acquiredAt: date("acquired_at", { mode: "date" }),
    acquisitionSource: text("acquisition_source"),
    purchaseCost: numeric("purchase_cost", {
      precision: 12,
      scale: 2,
      mode: "string",
    }),
    notes: text("notes"),
    legacyBagNumber: text("legacy_bag_number"),
    legacyLocationCode: text("legacy_location_code"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    unique("inventory_items_inventory_code_unique").on(table.inventoryCode),
    index("inventory_items_product_id_idx").on(table.productId),
    index("inventory_items_location_id_idx").on(table.locationId),
    index("inventory_items_status_idx").on(table.status),
    index("inventory_items_product_status_idx").on(table.productId, table.status),
    index("inventory_items_legacy_location_code_idx").on(table.legacyLocationCode),
    check(
      "inventory_items_inventory_code_format",
      sql`${table.inventoryCode} ~ '^INV-[0-9]{6,}$'`,
    ),
    check("inventory_items_quantity_non_negative", sql`${table.quantity} >= 0`),
    check(
      "inventory_items_quantity_status_consistency",
      sql`((${table.status} in ('AVAILABLE', 'RESERVED', 'DAMAGED')) and ${table.quantity} > 0) or ((${table.status} in ('SOLD', 'SCRAPPED')) and ${table.quantity} = 0)`,
    ),
    check(
      "inventory_items_purchase_cost_non_negative",
      sql`${table.purchaseCost} is null or ${table.purchaseCost} >= 0`,
    ),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    type: inventoryMovementTypeEnum("type").notNull(),
    quantity: integer("quantity").notNull(),
    fromLocationId: uuid("from_location_id").references(() => locations.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    toLocationId: uuid("to_location_id").references(() => locations.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    userId: uuid("user_id").references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    reason: text("reason").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("inventory_movements_inventory_item_created_idx").on(
      table.inventoryItemId,
      table.createdAt.desc(),
    ),
    index("inventory_movements_created_at_idx").on(table.createdAt.desc()),
    index("inventory_movements_from_location_id_idx").on(table.fromLocationId),
    index("inventory_movements_to_location_id_idx").on(table.toLocationId),
    check("inventory_movements_quantity_positive", sql`${table.quantity} > 0`),
    check("inventory_movements_reason_not_blank", sql`length(btrim(${table.reason})) > 0`),
    check(
      "inventory_movements_locations_different",
      sql`${table.fromLocationId} is null or ${table.toLocationId} is null or ${table.fromLocationId} <> ${table.toLocationId}`,
    ),
    check(
      "inventory_movements_move_locations_required",
      sql`${table.type} <> 'MOVE' or ${table.toLocationId} is not null`,
    ),
  ],
);
