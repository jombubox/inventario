import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAtColumn, updatedAtColumn } from "@/db/schema/columns";
import { user } from "@/db/schema/auth";
import { importJobStatusEnum } from "@/db/schema/enums";
import { inventoryItems } from "@/db/schema/inventory";
import { products } from "@/db/schema/products";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_at_idx").on(table.createdAt.desc()),
    index("audit_logs_user_id_idx").on(table.userId),
    index("audit_logs_action_created_idx").on(table.action, table.createdAt.desc()),
    check("audit_logs_action_not_blank", sql`length(btrim(${table.action})) > 0`),
    check("audit_logs_entity_type_not_blank", sql`length(btrim(${table.entityType})) > 0`),
  ],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    filename: text("filename").notNull(),
    fileHash: text("file_hash"),
    status: importJobStatusEnum("status").default("PENDING").notNull(),
    totalRows: integer("total_rows").default(0).notNull(),
    successfulRows: integer("successful_rows").default(0).notNull(),
    warningRows: integer("warning_rows").default(0).notNull(),
    failedRows: integer("failed_rows").default(0).notNull(),
    errors: jsonb("errors").$type<unknown[]>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    forceDuplicate: boolean("force_duplicate").default(false).notNull(),
    createdBy: uuid("created_by").references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: createdAtColumn(),
    startedAt: timestamp("started_at", {
      mode: "date",
      withTimezone: true,
      precision: 3,
    }),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
      precision: 3,
    }),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("import_jobs_status_created_idx").on(table.status, table.createdAt.desc()),
    index("import_jobs_created_by_idx").on(table.createdBy),
    index("import_jobs_file_hash_idx").on(table.fileHash),
    index("import_jobs_created_at_idx").on(table.createdAt.desc()),
    check("import_jobs_filename_not_blank", sql`length(btrim(${table.filename})) > 0`),
    check(
      "import_jobs_row_counts_non_negative",
      sql`${table.totalRows} >= 0 and ${table.successfulRows} >= 0 and ${table.warningRows} >= 0 and ${table.failedRows} >= 0`,
    ),
    check(
      "import_jobs_row_counts_within_total",
      sql`${table.successfulRows} + ${table.warningRows} + ${table.failedRows} <= ${table.totalRows}`,
    ),
  ],
);

export const operationalRateLimits = pgTable(
  "operational_rate_limits",
  {
    key: text("key").primaryKey(),
    windowStartedAt: timestamp("window_started_at", {
      mode: "date",
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    count: integer("count").default(1).notNull(),
  },
  (table) => [
    index("operational_rate_limits_window_idx").on(table.windowStartedAt),
    check("operational_rate_limits_count_positive", sql`${table.count} > 0`),
    check("operational_rate_limits_key_not_blank", sql`length(btrim(${table.key})) > 0`),
  ],
);

export const importJobRows = pgTable(
  "import_job_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importJobId: uuid("import_job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade", onUpdate: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").notNull(),
    action: text("action").notNull(),
    messages: jsonb("messages").$type<string[]>().default([]).notNull(),
    rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
    normalizedData: jsonb("normalized_data").$type<Record<string, unknown>>(),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    inventoryItemId: uuid("inventory_item_id").references(() => inventoryItems.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: createdAtColumn(),
  },
  (table) => [
    unique("import_job_rows_job_row_unique").on(table.importJobId, table.rowNumber),
    index("import_job_rows_fingerprint_idx").on(table.fingerprint),
    index("import_job_rows_status_idx").on(table.status),
    index("import_job_rows_product_id_idx").on(table.productId),
    index("import_job_rows_inventory_item_id_idx").on(table.inventoryItemId),
    check("import_job_rows_row_number_positive", sql`${table.rowNumber} > 0`),
    check("import_job_rows_status_not_blank", sql`length(btrim(${table.status})) > 0`),
    check("import_job_rows_action_not_blank", sql`length(btrim(${table.action})) > 0`),
    check(
      "import_job_rows_fingerprint_not_blank",
      sql`length(btrim(${table.fingerprint})) > 0`,
    ),
  ],
);
