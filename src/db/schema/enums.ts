import { pgEnum } from "drizzle-orm/pg-core";

export const productStatusValues = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export const productStatusEnum = pgEnum("product_status", productStatusValues);

export const locationTypeValues = [
  "WAREHOUSE",
  "ZONE",
  "SHELF",
  "BOX",
  "BAG",
  "OTHER",
] as const;
export const locationTypeEnum = pgEnum("location_type", locationTypeValues);

export const inventoryConditionValues = [
  "NEW",
  "USED_EXCELLENT",
  "USED_GOOD",
  "USED_FAIR",
  "FOR_PARTS",
  "UNKNOWN",
] as const;
export const inventoryConditionEnum = pgEnum(
  "inventory_condition",
  inventoryConditionValues,
);

export const inventoryStatusValues = [
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "DAMAGED",
  "SCRAPPED",
] as const;
export const inventoryStatusEnum = pgEnum("inventory_status", inventoryStatusValues);

export const inventoryMovementTypeValues = [
  "INITIAL",
  "IN",
  "OUT",
  "MOVE",
  "ADJUSTMENT",
  "SALE",
  "RETURN",
] as const;
export const inventoryMovementTypeEnum = pgEnum(
  "inventory_movement_type",
  inventoryMovementTypeValues,
);

export const importJobStatusValues = [
  "PENDING",
  "PREVIEWED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export const importJobStatusEnum = pgEnum("import_job_status", importJobStatusValues);
