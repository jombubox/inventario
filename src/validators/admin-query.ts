import { z } from "zod";

import {
  inventoryConditionValues,
  inventoryStatusValues,
  inventoryMovementTypeValues,
  productStatusValues,
} from "@/db/schema/enums";

const optionalBooleanParam = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  brand: z.string().trim().max(100).optional(),
  type: z.string().trim().max(100).optional(),
  status: z.enum(productStatusValues).optional(),
  public: optionalBooleanParam,
  stock: z.enum(["in-stock", "out-of-stock", "unlocated"]).optional(),
  page: z.coerce.number().int().positive().catch(1).default(1),
  pageSize: z.coerce.number().pipe(z.union([z.literal(20), z.literal(50), z.literal(100)])).catch(20).default(20),
  sort: z.enum(["updatedAt", "title", "sku", "createdAt"]).catch("updatedAt").default("updatedAt"),
  direction: z.enum(["asc", "desc"]).catch("desc").default("desc"),
});

export const inventoryListQuerySchema = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  condition: z.enum(inventoryConditionValues).optional(),
  status: z.enum(inventoryStatusValues).optional(),
  location: z.string().trim().max(100).optional(),
  unlocated: optionalBooleanParam,
  page: z.coerce.number().int().positive().catch(1).default(1),
  pageSize: z.coerce.number().pipe(z.union([z.literal(20), z.literal(50), z.literal(100)])).catch(20).default(20),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;

const optionalDateParam = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
);

export const movementListQuerySchema = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  type: z.enum(inventoryMovementTypeValues).optional(),
  userId: z.uuid().optional(),
  location: z.string().trim().max(100).optional(),
  from: optionalDateParam,
  to: optionalDateParam,
  page: z.coerce.number().int().positive().catch(1).default(1),
  pageSize: z.coerce.number().pipe(z.union([z.literal(20), z.literal(50), z.literal(100)])).catch(50).default(50),
});

export const auditListQuerySchema = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(100).optional(),
  userId: z.uuid().optional(),
  from: optionalDateParam,
  to: optionalDateParam,
  page: z.coerce.number().int().positive().catch(1).default(1),
  pageSize: z.coerce.number().pipe(z.union([z.literal(20), z.literal(50), z.literal(100)])).catch(50).default(50),
});

export type MovementListQuery = z.infer<typeof movementListQuerySchema>;
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
