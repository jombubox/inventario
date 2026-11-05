import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/connection";
import type { DatabaseTransaction as Tx } from "@/db/executor";
import { brands, componentTypes, inventoryItems, inventoryMovements, locations, products, saleAllocations, saleEvents, saleItems, salePayments, saleReturnItems, saleReturns, sales } from "@/db/schema";
import { recordStockMovementInTransaction } from "@/features/inventory/server/inventory-service";
import { EntityNotFoundError, InvalidOperationError } from "@/features/shared/domain/service-errors";
import { assertReturnQuantity, balance, calculateTotals, saleFolio } from "../domain/sales";
import { createSaleSchema, saleActionSchema, type CreateSaleInput, type SaleActionInput } from "../domain/validation";

function fail(message: string): never { throw new InvalidOperationError(message); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function hash(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
async function event(tx: Tx, saleId: string, key: string, requestHash: string, type: string, details: Record<string, unknown> = {}) {
  // Private sale timeline only; never log these payloads. ADMIN is not a UUID identity.
  await tx.insert(saleEvents).values({ saleId, key, requestHash, type, actor: "ADMIN", details });
}
async function activeProduct(tx: Tx, id: string) {
  const [p] = await tx.select().from(products).where(eq(products.id, id)).for("share");
  if (!p || p.deletedAt || p.status === "ARCHIVED" || p.currency !== "MXN") fail("El producto está archivado, eliminado o no tiene moneda MXN.");
  const [brand] = await tx.select().from(brands).where(eq(brands.id, p.brandId)).for("share");
  const [type] = await tx.select().from(componentTypes).where(eq(componentTypes.id, p.componentTypeId)).for("share");
  if (!brand?.active || !type?.active) fail("La marca o el tipo de pieza están archivados.");
  return { ...p, brand: brand.name };
}
async function activeLocation(tx: Tx, locationId: string | null) {
  const visited = new Set<string>(); const names: string[] = []; let current = locationId;
  while (current) {
    if (visited.has(current) || visited.size >= 64) fail("La jerarquía de ubicaciones no es válida.");
    visited.add(current);
    const [location] = await tx.select().from(locations).where(eq(locations.id, current)).for("share");
    if (!location?.active) fail("La ubicación, caja o bolsa está archivada.");
    names.unshift(location.name);
    current = location.parentId;
  }
  return names.join(" > ");
}
async function lockSources(tx: Tx, ids: string[]) {
  // Stable order serializes competing sales and avoids lock inversion between multi-source sales.
  return tx.select().from(inventoryItems).where(inArray(inventoryItems.id, ids)).orderBy(asc(inventoryItems.id)).for("update");
}
async function complete(tx: Tx, sale: typeof sales.$inferSelect) {
  if (sale.status !== "DRAFT") fail("Solo se puede completar una venta en borrador.");
  const lines = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
  const allocations = await tx.select({ allocation: saleAllocations }).from(saleAllocations).innerJoin(saleItems, eq(saleItems.id, saleAllocations.saleItemId)).where(eq(saleItems.saleId, sale.id));
  const sources = await lockSources(tx, allocations.map(a => a.allocation.inventoryItemId));
  for (const id of [...new Set(lines.map(i => i.productId))].sort()) await activeProduct(tx, id);
  for (const { allocation: a } of allocations) {
    const source = sources.find(s => s.id === a.inventoryItemId);
    const line = lines.find(i => i.id === a.saleItemId)!;
    if (!source || source.productId !== line.productId || source.status !== "AVAILABLE" || source.quantity < a.quantity || source.condition === "FOR_PARTS") fail("Stock insuficiente o no disponible. Revisa los orígenes seleccionados.");
    const lockedPath = await activeLocation(tx, source.locationId);
    const currentLocation = source.locationId ? lockedPath : source.legacyLocationCode ?? "Sin ubicación";
    if (source.locationId !== a.source.locationId || currentLocation !== a.source.location || source.legacyBagNumber !== a.source.bag || source.condition !== a.source.condition) fail("El origen de stock cambió desde el borrador. Registra una nueva venta con la ubicación actual.");
    const movement = await recordStockMovementInTransaction(tx, { id: source.id, type: "SALE", quantity: a.quantity, resultingStatus: "SOLD", reason: `Venta ${sale.folio}` }, { saleId: sale.id, folio: sale.folio, allocationId: a.id, productId: line.productId, actor: "ADMIN" });
    await tx.update(saleAllocations).set({ movementId: movement.movementId }).where(eq(saleAllocations.id, a.id));
  }
  await tx.update(sales).set({ status: "COMPLETED", completedAt: new Date(), updatedAt: new Date() }).where(eq(sales.id, sale.id));
}
export async function createSale(db: Database, raw: CreateSaleInput) {
  const input = createSaleSchema.parse(raw); const requestHash = hash(input);
  return db.transaction(async tx => {
    const id = randomUUID();
    const totals = calculateTotals(input.items.map(i => ({ ...i, quantity: i.allocations.reduce((n, a) => n + a.quantity, 0) })), input.orderDiscountCents, input.shippingCents, input.taxCents);
    const [sale] = await tx.insert(sales).values({ id, folio: saleFolio(id), key: input.key, requestHash, status: "DRAFT", customer: input.customer, delivery: input.delivery, ...totals, notes: input.notes }).onConflictDoNothing({ target: sales.key }).returning();
    if (!sale) {
      const [existing] = await tx.select().from(sales).where(eq(sales.key, input.key));
      if (!existing) throw new Error("Idempotent sale not found.");
      if (existing.requestHash !== requestHash) fail("La clave de reintento ya se utilizó con otros datos.");
      return existing.id;
    }
    const sources = await lockSources(tx, input.items.flatMap(i => i.allocations.map(a => a.inventoryItemId)));
    for (const item of [...input.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const p = await activeProduct(tx, item.productId);
      const [line] = await tx.insert(saleItems).values({ saleId: sale.id, productId: p.id, snapshot: { sku: p.sku, title: p.title, partNumber: p.partNumber, condition: p.condition, warranty: p.warranty, brand: p.brand }, quantity: item.allocations.reduce((n, a) => n + a.quantity, 0), unitPriceCents: item.unitPriceCents, discountCents: item.discountCents }).returning();
      if (!line) throw new Error("Sale item insert failed.");
      for (const a of item.allocations) {
        const source = sources.find(s => s.id === a.inventoryItemId);
        if (!source || source.productId !== p.id || source.status !== "AVAILABLE" || source.quantity < a.quantity || source.condition === "FOR_PARTS") fail("El origen seleccionado no tiene stock vendible suficiente para este producto.");
        const lockedPath = await activeLocation(tx, source.locationId);
        await tx.insert(saleAllocations).values({ saleItemId: line.id, inventoryItemId: source.id, quantity: a.quantity, source: { inventoryCode: source.inventoryCode, locationId: source.locationId, location: source.locationId ? lockedPath : source.legacyLocationCode ?? "Sin ubicación", bag: source.legacyBagNumber, condition: source.condition } });
      }
    }
    if (input.status === "COMPLETED") {
      await complete(tx, sale);
      if (input.initialPayment) await tx.insert(salePayments).values({ ...input.initialPayment, saleId: sale.id, occurredAt: new Date(input.initialPayment.occurredAt) });
    }
    await event(tx, sale.id, input.key, requestHash, input.status === "DRAFT" ? "CREATED" : "COMPLETED_EVENT", { totalCents: sale.totalCents, initialPaymentCents: input.initialPayment?.amountCents ?? 0 });
    return sale.id;
  });
}
async function financials(tx: Tx, sale: typeof sales.$inferSelect) {
  const payments = await tx.select().from(salePayments).where(eq(salePayments.saleId, sale.id));
  return balance(sale.totalCents, sale.creditedCents, payments.filter(p => p.kind === "PAYMENT").reduce((s, p) => s + p.amountCents, 0), payments.filter(p => p.kind === "REFUND").reduce((s, p) => s + p.amountCents, 0));
}
async function restock(tx: Tx, sale: typeof sales.$inferSelect, a: typeof saleAllocations.$inferSelect, quantity: number, disposition: "SELLABLE" | "DAMAGED" | "NONE") {
  if (disposition === "NONE") return { restockedInventoryItemId: null, movementId: null };
  const [source] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, a.inventoryItemId)).for("update");
  if (!source) fail("El origen de inventario ya no existe.");
  await activeProduct(tx, source.productId); await activeLocation(tx, source.locationId);
  const context = { saleId: sale.id, folio: sale.folio, allocationId: a.id, productId: source.productId, actor: "ADMIN" as const };
  if (disposition === "SELLABLE" && (source.status === "AVAILABLE" || source.status === "SOLD")) {
    const restored = await recordStockMovementInTransaction(tx, { id: source.id, type: "RETURN", quantity, resultingStatus: "AVAILABLE", reason: `Reintegro ${sale.folio}` }, context);
    return { restockedInventoryItemId: restored.id, movementId: restored.movementId };
  }
  // Keep damaged returns separate from sellable stock; also never reopen a reserved/damaged/scrapped source as AVAILABLE.
  const [newSource] = await tx.insert(inventoryItems).values({ productId: source.productId, locationId: source.locationId, quantity, status: disposition === "DAMAGED" ? "DAMAGED" : "AVAILABLE", condition: source.condition, purchaseCost: source.purchaseCost, acquiredAt: source.acquiredAt, acquisitionSource: source.acquisitionSource, legacyBagNumber: source.legacyBagNumber, legacyLocationCode: source.legacyLocationCode, notes: `Devolución ${sale.folio}, origen ${source.inventoryCode}` }).returning();
  if (!newSource) throw new Error("Return stock insert failed.");
  const [movement] = await tx.insert(inventoryMovements).values({ inventoryItemId: newSource.id, type: "RETURN", quantity, toLocationId: newSource.locationId, reason: `Devolución ${sale.folio}`, metadata: { ...context, originalInventoryItemId: source.id, disposition, direction: "IN", fromQuantity: 0, toQuantity: quantity } }).returning();
  if (!movement) throw new Error("Return movement insert failed.");
  return { restockedInventoryItemId: newSource.id, movementId: movement.id };
}
export async function mutateSale(db: Database, id: string, raw: SaleActionInput) {
  const input = saleActionSchema.parse(raw); const requestHash = hash(input);
  return db.transaction(async tx => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for("update");
    if (!sale) throw new EntityNotFoundError("No encontramos la venta.");
    const [previous] = await tx.select().from(saleEvents).where(and(eq(saleEvents.saleId, id), eq(saleEvents.key, input.key)));
    if (previous) { if (previous.requestHash !== requestHash) fail("La clave de reintento ya se utilizó con otros datos."); return id; }
    let eventType: string = input.action; let details: Record<string, unknown> = {};
    if (input.action === "complete") { await complete(tx, sale); eventType = "COMPLETED_EVENT"; }
    else if (input.action === "payment") {
      if (sale.status === "DRAFT" || (sale.status === "CANCELLED" && input.kind === "PAYMENT")) fail("Esta venta no admite nuevos pagos.");
      const b = await financials(tx, sale);
      if (input.amountCents > (input.kind === "PAYMENT" ? b.outstandingCents : b.refundDueCents)) fail(input.kind === "PAYMENT" ? "El pago supera el saldo pendiente." : "El reembolso supera el saldo a favor. Registra primero la devolución o cancelación.");
      await tx.insert(salePayments).values({ saleId: id, key: input.key, kind: input.kind, method: input.method, amountCents: input.amountCents, occurredAt: new Date(input.occurredAt), reference: input.reference, notes: input.notes });
      eventType = input.kind; details = { amountCents: input.amountCents, method: input.method };
    } else if (input.action === "fulfillment") {
      if (sale.status !== "COMPLETED") fail("La entrega solo se actualiza en ventas completadas.");
      if (input.status === "SHIPPED" && (sale.delivery.method !== "SHIPPING" || !input.carrier || !input.tracking)) fail("Para marcar enviado indica paquetería y número de guía.");
      await tx.update(sales).set({ deliveryStatus: input.status, delivery: { ...sale.delivery, carrier: input.carrier, tracking: input.tracking, estimatedDate: input.estimatedDate, notes: input.notes }, updatedAt: new Date() }).where(eq(sales.id, id));
      eventType = "FULFILLMENT"; details = { before: sale.deliveryStatus, after: input.status, beforeFields: { carrier: sale.delivery.carrier, tracking: sale.delivery.tracking, estimatedDate: sale.delivery.estimatedDate, notes: sale.delivery.notes }, afterFields: { carrier: input.carrier, tracking: input.tracking, estimatedDate: input.estimatedDate, notes: input.notes } };
    } else {
      if (sale.status === "CANCELLED") fail("La venta ya está cancelada; su stock no se puede restaurar dos veces.");
      if (input.action === "return" && sale.status !== "COMPLETED") fail("Solo se pueden devolver productos de ventas completadas.");
      const allocations = await tx.select({ a: saleAllocations }).from(saleAllocations).innerJoin(saleItems, eq(saleItems.id, saleAllocations.saleItemId)).where(eq(saleItems.saleId, id));
      const selected = input.action === "return" ? input.items : sale.status === "COMPLETED" ? allocations.filter(({ a }) => a.quantity > a.returnedQuantity).map(({ a }) => ({ allocationId: a.id, quantity: a.quantity - a.returnedQuantity, disposition: "SELLABLE" as const })) : [];
      if (new Set(selected.map(i => i.allocationId)).size !== selected.length) fail("No repitas un origen en la devolución.");
      await lockSources(tx, allocations.map(({ a }) => a.inventoryItemId));
      const creditCents = input.action === "cancel" ? sale.totalCents - sale.creditedCents : input.creditCents;
      if (creditCents > sale.totalCents - sale.creditedCents) fail("El abono supera el importe de la venta pendiente de abonar.");
      const [returnRecord] = await tx.insert(saleReturns).values({ saleId: id, reason: input.reason, condition: input.action === "return" ? input.condition : "Cancelación: reintegro del stock no devuelto", creditCents }).returning();
      if (!returnRecord) throw new Error("Sale return insert failed.");
      for (const selectedItem of [...selected].sort((a, b) => a.allocationId.localeCompare(b.allocationId))) {
        const a = allocations.find(row => row.a.id === selectedItem.allocationId)?.a;
        if (!a) fail("El origen no pertenece a esta venta.");
        try { assertReturnQuantity(a.quantity, a.returnedQuantity, selectedItem.quantity); } catch (e) { fail((e as Error).message); }
        const restored = await restock(tx, sale, a, selectedItem.quantity, selectedItem.disposition);
        await tx.insert(saleReturnItems).values({ returnId: returnRecord.id, allocationId: a.id, quantity: selectedItem.quantity, disposition: selectedItem.disposition, ...restored });
        await tx.update(saleAllocations).set({ returnedQuantity: a.returnedQuantity + selectedItem.quantity }).where(eq(saleAllocations.id, a.id));
      }
      await tx.update(sales).set({ creditedCents: sale.creditedCents + creditCents, updatedAt: new Date(), ...(input.action === "cancel" ? { status: "CANCELLED" as const, cancelledAt: new Date(), cancellationReason: input.reason, deliveryStatus: "CANCELLED" as const } : {}) }).where(eq(sales.id, id));
      eventType = input.action === "cancel" ? "CANCELLED_EVENT" : "RETURN"; details = { returnId: returnRecord.id, creditCents, quantities: selected.map(i => ({ ...i })) };
    }
    await event(tx, id, input.key, requestHash, eventType, details);
    return id;
  });
}
