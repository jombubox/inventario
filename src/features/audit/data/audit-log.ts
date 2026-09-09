import type { DatabaseExecutor } from "@/db/executor";
import { auditLogs } from "@/db/schema";
import { redactRecord } from "@/lib/redaction";

export const auditActionValues = [
  "PRODUCT_CREATED",
  "PRODUCT_UPDATED",
  "PRODUCT_ARCHIVED",
  "INVENTORY_CREATED",
  "INVENTORY_UPDATED",
  "INVENTORY_ADJUSTED",
  "INVENTORY_MOVED",
  "LOCATION_CREATED",
  "LOCATION_UPDATED",
  "IMPORT_PREVIEWED",
  "IMPORT_STARTED",
  "IMPORT_COMPLETED",
  "IMPORT_FAILED",
  "PRODUCT_IMAGE_ADDED",
  "PRODUCT_IMAGE_REMOVED",
  "PRODUCT_IMAGE_REORDERED",
  "PRODUCT_PRIMARY_IMAGE_CHANGED",
  "PRODUCT_IMAGE_ALT_UPDATED",
  "INVENTORY_IN",
  "INVENTORY_OUT",
  "INVENTORY_SALE",
  "INVENTORY_RETURN",
  "INVENTORY_EXPORTED",
] as const;

export type AuditAction = (typeof auditActionValues)[number];

export function createAuditLog(
  db: DatabaseExecutor,
  input: {
    action: AuditAction;
    entityType:
      | "PRODUCT"
      | "PRODUCT_IMAGE"
      | "INVENTORY_ITEM"
      | "LOCATION"
      | "IMPORT_JOB";
    entityId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  return db.insert(auditLogs).values({
    userId: null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: redactRecord(input.before),
    after: redactRecord(input.after),
    metadata: redactRecord(input.metadata),
  });
}
