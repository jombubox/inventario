import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAtColumn, updatedAtColumn } from "@/db/schema/columns";
import { locationTypeEnum } from "@/db/schema/enums";

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: locationTypeEnum("type").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => locations.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    active: boolean("active").default(true).notNull(),
    notes: text("notes"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    unique("locations_code_unique").on(table.code),
    index("locations_parent_id_idx").on(table.parentId),
    index("locations_type_active_idx").on(table.type, table.active),
    check("locations_code_not_blank", sql`length(btrim(${table.code})) > 0`),
    check("locations_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check("locations_not_own_parent", sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`),
  ],
);
