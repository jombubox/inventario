import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAtColumn, updatedAtColumn } from "./columns";
import { inventoryItems, inventoryMovements } from "./inventory";
import { products } from "./products";
import type { CustomerSnapshot, DeliverySnapshot } from "@/features/sales/domain/sales";

// One-time customers are snapshots, not accounts. No duplicate customer directory or PII lookup table.
export const sales = pgTable("sales", {
  id: uuid("id").defaultRandom().primaryKey(), folio: text("folio").notNull(), key: uuid("idempotency_key").notNull(), requestHash: text("request_hash").notNull(),
  status: text("status").$type<"DRAFT" | "COMPLETED" | "CANCELLED">().notNull(),
  customer: jsonb("customer").$type<CustomerSnapshot>().notNull(), delivery: jsonb("delivery").$type<DeliverySnapshot>().notNull(),
  deliveryStatus: text("delivery_status").$type<"PENDING" | "PREPARING" | "SHIPPED" | "DELIVERED" | "CANCELLED">().default("PENDING").notNull(),
  currency: text("currency").default("MXN").notNull(), subtotalCents: integer("subtotal_cents").notNull(), itemDiscountCents: integer("item_discount_cents").notNull(),
  orderDiscountCents: integer("order_discount_cents").notNull(), shippingCents: integer("shipping_cents").notNull(), taxCents: integer("tax_cents").notNull(), totalCents: integer("total_cents").notNull(), creditedCents: integer("credited_cents").default(0).notNull(),
  notes: text("notes").notNull(), actor: text("actor").default("ADMIN").notNull(),
  createdAt: createdAtColumn(), updatedAt: updatedAtColumn(), completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }), cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }), cancellationReason: text("cancellation_reason"),
}, t => [
  unique("sales_folio_unique").on(t.folio), unique("sales_idempotency_unique").on(t.key), index("sales_created_idx").on(t.createdAt.desc(), t.id), index("sales_status_created_idx").on(t.status, t.createdAt.desc()),
  check("sales_status_valid", sql`${t.status} in ('DRAFT','COMPLETED','CANCELLED')`), check("sales_delivery_valid", sql`${t.deliveryStatus} in ('PENDING','PREPARING','SHIPPED','DELIVERED','CANCELLED')`),
  check("sales_money_valid", sql`${t.currency} = 'MXN' and ${t.subtotalCents} >= 0 and ${t.itemDiscountCents} >= 0 and ${t.orderDiscountCents} >= 0 and ${t.shippingCents} >= 0 and ${t.taxCents} >= 0 and ${t.totalCents} between 0 and 2000000000 and ${t.creditedCents} between 0 and ${t.totalCents} and ${t.itemDiscountCents} + ${t.orderDiscountCents} <= ${t.subtotalCents} and ${t.totalCents} = ${t.subtotalCents}::bigint - ${t.itemDiscountCents} - ${t.orderDiscountCents} + ${t.shippingCents} + ${t.taxCents}`),
  check("sales_lifecycle_valid", sql`(${t.status} = 'DRAFT' and ${t.completedAt} is null and ${t.cancelledAt} is null) or (${t.status} = 'COMPLETED' and ${t.completedAt} is not null and ${t.cancelledAt} is null) or (${t.status} = 'CANCELLED' and ${t.cancelledAt} is not null and length(btrim(${t.cancellationReason})) >= 3 and ${t.creditedCents} = ${t.totalCents})`),
]);
export const saleItems = pgTable("sale_items", {
  id: uuid("id").defaultRandom().primaryKey(), saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "restrict" }), productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  snapshot: jsonb("snapshot").$type<{ sku: string; title: string; partNumber: string | null; condition: string | null; warranty: string | null; brand: string }>().notNull(),
  quantity: integer("quantity").notNull(), unitPriceCents: integer("unit_price_cents").notNull(), discountCents: integer("discount_cents").notNull(),
}, t => [index("sale_items_sale_idx").on(t.saleId), index("sale_items_product_idx").on(t.productId), check("sale_items_money_valid", sql`${t.quantity} between 1 and 10000 and ${t.unitPriceCents} between 0 and 2000000000 and ${t.discountCents} between 0 and ${t.quantity}::bigint * ${t.unitPriceCents}`)]);
export const saleAllocations = pgTable("sale_allocations", {
  id: uuid("id").defaultRandom().primaryKey(), saleItemId: uuid("sale_item_id").notNull().references(() => saleItems.id, { onDelete: "restrict" }), inventoryItemId: uuid("inventory_item_id").notNull().references(() => inventoryItems.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(), returnedQuantity: integer("returned_quantity").default(0).notNull(),
  source: jsonb("source").$type<{ inventoryCode: string; locationId: string | null; location: string; bag: string | null; condition: string }>().notNull(),
  movementId: uuid("movement_id").references(() => inventoryMovements.id, { onDelete: "restrict" }),
}, t => [unique("sale_allocations_item_source_unique").on(t.saleItemId, t.inventoryItemId), unique("sale_allocations_movement_unique").on(t.movementId), index("sale_allocations_source_idx").on(t.inventoryItemId), check("sale_allocations_quantity_valid", sql`${t.quantity} between 1 and 10000 and ${t.returnedQuantity} between 0 and ${t.quantity}`)]);
export const salePayments = pgTable("sale_payments", {
  id: uuid("id").defaultRandom().primaryKey(), saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "restrict" }), key: uuid("idempotency_key").notNull(), kind: text("kind").$type<"PAYMENT" | "REFUND">().notNull(),
  method: text("method").notNull(), amountCents: integer("amount_cents").notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull(), reference: text("reference").notNull(), notes: text("notes").notNull(), actor: text("actor").default("ADMIN").notNull(), createdAt: createdAtColumn(),
}, t => [unique("sale_payments_key_unique").on(t.saleId, t.key), index("sale_payments_sale_date_idx").on(t.saleId, t.occurredAt), check("sale_payments_amount_positive", sql`${t.amountCents} between 1 and 2000000000`), check("sale_payments_kind_valid", sql`${t.kind} in ('PAYMENT','REFUND')`), check("sale_payments_method_valid", sql`${t.method} in ('CASH','TRANSFER','CARD','MERCADO_PAGO','OTHER')`)]);
export const saleReturns = pgTable("sale_returns", {
  id: uuid("id").defaultRandom().primaryKey(), saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "restrict" }), reason: text("reason").notNull(), condition: text("condition").notNull(), creditCents: integer("credit_cents").notNull(), actor: text("actor").default("ADMIN").notNull(), createdAt: createdAtColumn(),
}, t => [index("sale_returns_sale_idx").on(t.saleId), check("sale_returns_credit_valid", sql`${t.creditCents} between 0 and 2000000000`)]);
export const saleReturnItems = pgTable("sale_return_items", {
  id: uuid("id").defaultRandom().primaryKey(), returnId: uuid("return_id").notNull().references(() => saleReturns.id, { onDelete: "restrict" }), allocationId: uuid("allocation_id").notNull().references(() => saleAllocations.id, { onDelete: "restrict" }), quantity: integer("quantity").notNull(), disposition: text("disposition").notNull(),
  restockedInventoryItemId: uuid("restocked_inventory_item_id").references(() => inventoryItems.id, { onDelete: "restrict" }), movementId: uuid("movement_id").references(() => inventoryMovements.id, { onDelete: "restrict" }),
}, t => [unique("sale_return_items_allocation_unique").on(t.returnId, t.allocationId), index("sale_return_items_allocation_idx").on(t.allocationId), check("sale_return_items_quantity_positive", sql`${t.quantity} between 1 and 10000`), check("sale_return_items_disposition_valid", sql`${t.disposition} in ('SELLABLE','DAMAGED','NONE')`)]);
export const saleEvents = pgTable("sale_events", {
  id: uuid("id").defaultRandom().primaryKey(), saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "restrict" }), key: uuid("idempotency_key").notNull(), requestHash: text("request_hash").notNull(), type: text("type").notNull(), actor: text("actor").default("ADMIN").notNull(), details: jsonb("details").$type<Record<string, unknown>>().notNull(), createdAt: createdAtColumn(),
}, t => [unique("sale_events_idempotency_unique").on(t.saleId, t.key), index("sale_events_sale_created_idx").on(t.saleId, t.createdAt)]);
