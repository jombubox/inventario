import "server-only";
import { and, asc, desc, eq, ilike, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db/connection";
import type { DatabaseExecutor } from "@/db/executor";
import { brands, componentTypes, inventoryItems, locations, products, saleAllocations, saleEvents, saleItems, salePayments, saleReturnItems, saleReturns, sales } from "@/db/schema";
import { productSearchCondition } from "@/features/products/data/product-search";
import { createLocationBreadcrumbResolver } from "@/features/locations/domain/location-hierarchy";
import { getR2PublicUrl } from "@/features/images/server/r2-public-url";
import { balance } from "../domain/sales";
import type { SalesQuery } from "../domain/validation";

const paid = sql<number>`coalesce((select sum(p.amount_cents) from sale_payments p where p.sale_id = ${sales.id} and p.kind = 'PAYMENT'), 0)::bigint`.mapWith(Number);
const refunded = sql<number>`coalesce((select sum(p.amount_cents) from sale_payments p where p.sale_id = ${sales.id} and p.kind = 'REFUND'), 0)::bigint`.mapWith(Number);
const net = sql`(${paid} - ${refunded})`;
const obligation = sql`(${sales.totalCents} - ${sales.creditedCents})`;
const paymentStatus = sql<string>`case when ${net} > ${obligation} then 'REFUND_DUE' when ${obligation} = 0 and ${refunded} > 0 then 'REFUNDED' when ${net} >= ${obligation} then 'PAID' when ${net} > 0 then 'PARTIAL' else 'UNPAID' end`;
function conditions(q: SalesQuery): SQL[] {
  const where: SQL[] = [];
  if (q.q) {
    const pattern = `%${q.q.replace(/[\\%_]/gu, "\\$&")}%`;
    where.push(sql`(${ilike(sales.folio, pattern)} or ${sales.customer}->>'name' ilike ${pattern} or ${sales.customer}->>'phone' ilike ${pattern} or ${sales.customer}->>'email' ilike ${pattern} or ${sales.delivery}->>'tracking' ilike ${pattern} or exists(select 1 from sale_items si where si.sale_id = ${sales.id} and (si.snapshot->>'sku' ilike ${pattern} or si.snapshot->>'title' ilike ${pattern})))`);
  }
  if (q.status) where.push(eq(sales.status, q.status));
  if (q.delivery) where.push(eq(sales.deliveryStatus, q.delivery));
  if (q.payment) where.push(sql`${paymentStatus} = ${q.payment}`);
  if (q.method) where.push(sql`exists(select 1 from sale_payments p where p.sale_id = ${sales.id} and p.kind = 'PAYMENT' and p.method = ${q.method})`);
  if (q.from) where.push(sql`${sales.createdAt} >= (${q.from}::date::timestamp at time zone 'America/Mexico_City')`);
  if (q.to) where.push(sql`${sales.createdAt} < ((${q.to}::date + 1)::timestamp at time zone 'America/Mexico_City')`);
  return where;
}
const selection = { sale: sales, paidCents: paid, refundedCents: refunded, itemCount: sql<number>`(select coalesce(sum(si.quantity), 0) from sale_items si where si.sale_id = ${sales.id})::int`.mapWith(Number) };
export async function listSales(db: DatabaseExecutor, q: SalesQuery, exportLimit?: number) {
  const where = and(...conditions(q));
  const [countRow] = await db.select({ total: sql<number>`count(*)::int`.mapWith(Number) }).from(sales).where(where);
  const total = countRow?.total ?? 0;
  const rows = await db.select(selection).from(sales).where(where).orderBy(desc(sales.createdAt), desc(sales.id)).limit(exportLimit ?? 20).offset(exportLimit ? 0 : (q.page - 1) * 20);
  return { rows: rows.map(row => ({ ...row, ...balance(row.sale.totalCents, row.sale.creditedCents, row.paidCents, row.refundedCents) })), total, pageCount: Math.max(1, Math.ceil(total / 20)) };
}
export async function getSale(db: Database, id: string) {
  return db.transaction(async tx => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, id));
    if (!sale) return null;
    const lines = await tx.select().from(saleItems).where(eq(saleItems.saleId, id)).orderBy(asc(saleItems.id));
    const allocations = await tx.select({ allocation: saleAllocations }).from(saleAllocations).innerJoin(saleItems, eq(saleItems.id, saleAllocations.saleItemId)).where(eq(saleItems.saleId, id));
    const payments = await tx.select().from(salePayments).where(eq(salePayments.saleId, id)).orderBy(asc(salePayments.occurredAt), asc(salePayments.createdAt));
    const returns = await tx.select().from(saleReturns).where(eq(saleReturns.saleId, id)).orderBy(asc(saleReturns.createdAt));
    const returnItems = await tx.select({ item: saleReturnItems }).from(saleReturnItems).innerJoin(saleReturns, eq(saleReturns.id, saleReturnItems.returnId)).where(eq(saleReturns.saleId, id));
    const events = await tx.select().from(saleEvents).where(eq(saleEvents.saleId, id)).orderBy(asc(saleEvents.createdAt), asc(saleEvents.id));
    return { sale, lines, allocations: allocations.map(a => a.allocation), payments, returns, returnItems: returnItems.map(i => i.item), events, ...balance(sale.totalCents, sale.creditedCents, payments.filter(p => p.kind === "PAYMENT").reduce((s, p) => s + p.amountCents, 0), payments.filter(p => p.kind === "REFUND").reduce((s, p) => s + p.amountCents, 0)) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSale>>>;
export async function salesReport(db: DatabaseExecutor, q: SalesQuery) {
  const where = conditions(q);
  const [summary] = await db.select({
    grossCents: sql<number>`coalesce(sum(${sales.totalCents}) filter(where ${sales.completedAt} is not null),0)`.mapWith(Number),
    creditsCents: sql<number>`coalesce(sum(${sales.creditedCents}) filter(where ${sales.completedAt} is not null),0)`.mapWith(Number),
    collectedCents: sql<number>`coalesce(sum(${net}),0)`.mapWith(Number), refundsCents: sql<number>`coalesce(sum(${refunded}),0)`.mapWith(Number),
    outstandingCents: sql<number>`coalesce(sum(greatest(0,${obligation} - ${net})) filter(where ${sales.status} = 'COMPLETED'),0)`.mapWith(Number),
    discountsCents: sql<number>`coalesce(sum(${sales.itemDiscountCents}::bigint + ${sales.orderDiscountCents}) filter(where ${sales.completedAt} is not null),0)`.mapWith(Number),
    count: sql<number>`count(*) filter(where ${sales.completedAt} is not null)::int`.mapWith(Number), cancellations: sql<number>`count(*) filter(where ${sales.status} = 'CANCELLED')::int`.mapWith(Number),
    todayCents: sql<number>`coalesce(sum(${obligation}) filter(where ${sales.completedAt} at time zone 'America/Mexico_City' >= date_trunc('day', now() at time zone 'America/Mexico_City')),0)`.mapWith(Number),
    monthCents: sql<number>`coalesce(sum(${obligation}) filter(where ${sales.completedAt} at time zone 'America/Mexico_City' >= date_trunc('month', now() at time zone 'America/Mexico_City')),0)`.mapWith(Number),
  }).from(sales).where(and(...where));
  const daily = await db.select({ period: sql<string>`to_char(${sales.completedAt} at time zone 'America/Mexico_City','YYYY-MM-DD')`, grossCents: sql<number>`sum(${sales.totalCents})`.mapWith(Number), netCents: sql<number>`sum(${obligation})`.mapWith(Number), count: sql<number>`count(*)::int`.mapWith(Number) }).from(sales).where(and(...where, sql`${sales.completedAt} is not null`)).groupBy(sql`1`).orderBy(desc(sql`1`)).limit(366);
  const monthly = await db.select({ period: sql<string>`to_char(${sales.completedAt} at time zone 'America/Mexico_City','YYYY-MM')`, grossCents: sql<number>`sum(${sales.totalCents})`.mapWith(Number), netCents: sql<number>`sum(${obligation})`.mapWith(Number), count: sql<number>`count(*)::int`.mapWith(Number) }).from(sales).where(and(...where, sql`${sales.completedAt} is not null`)).groupBy(sql`1`).orderBy(desc(sql`1`)).limit(120);
  const topProducts = await db.select({ sku: sql<string>`${saleItems.snapshot}->>'sku'`, title: sql<string>`${saleItems.snapshot}->>'title'`, quantity: sql<number>`sum(${saleAllocations.quantity} - ${saleAllocations.returnedQuantity})`.mapWith(Number) }).from(sales).innerJoin(saleItems, eq(saleItems.saleId, sales.id)).innerJoin(saleAllocations, eq(saleAllocations.saleItemId, saleItems.id)).where(and(...where, eq(sales.status, "COMPLETED"))).groupBy(sql`1,2`).orderBy(desc(sql`3`)).limit(20);
  const methods = await db.select({ method: salePayments.method, collectedCents: sql<number>`sum(case when ${salePayments.kind} = 'PAYMENT' then ${salePayments.amountCents} else -${salePayments.amountCents} end)`.mapWith(Number) }).from(sales).innerJoin(salePayments, eq(salePayments.saleId, sales.id)).where(and(...where)).groupBy(salePayments.method);
  const deliveries = await db.select({ status: sales.deliveryStatus, count: sql<number>`count(*)::int`.mapWith(Number) }).from(sales).where(and(...where)).groupBy(sales.deliveryStatus);
  const [returns] = await db.select({ count: sql<number>`count(*)::int`.mapWith(Number), creditCents: sql<number>`coalesce(sum(${saleReturns.creditCents}),0)`.mapWith(Number), quantity: sql<number>`coalesce(sum((select coalesce(sum(ri.quantity),0) from sale_return_items ri where ri.return_id = ${saleReturns.id})),0)`.mapWith(Number) }).from(sales).innerJoin(saleReturns, eq(saleReturns.saleId, sales.id)).where(and(...where));
  if (!summary || !returns) throw new Error("Report aggregate missing.");
  return { ...summary, netCents: summary.grossCents - summary.creditsCents, averageCents: summary.count ? Math.round((summary.grossCents - summary.creditsCents) / summary.count) : 0, daily, monthly, topProducts, methods, deliveries, returns };
}
export async function searchSaleStock(db: DatabaseExecutor, q: string, page = 1) {
  const result = await db.select({ source: inventoryItems, product: { id: products.id, title: products.title, sku: products.sku, partNumber: products.partNumber, price: products.salePrice, condition: products.condition, warranty: products.warranty }, brand: brands.name,
    imageKey: sql<string | null>`(select storage_key from product_images where product_id = ${products.id} order by is_primary desc, sort_order limit 1)`,
    imageUrl: sql<string | null>`(select url from product_images where product_id = ${products.id} order by is_primary desc, sort_order limit 1)`,
  }).from(inventoryItems).innerJoin(products, eq(products.id, inventoryItems.productId)).innerJoin(brands, eq(brands.id, products.brandId)).innerJoin(componentTypes, eq(componentTypes.id, products.componentTypeId)).where(and(eq(inventoryItems.status, "AVAILABLE"), sql`${inventoryItems.quantity} > 0`, ne(inventoryItems.condition, "FOR_PARTS"), ne(products.status, "ARCHIVED"), isNull(products.deletedAt), eq(brands.active, true), eq(componentTypes.active, true), eq(products.currency, "MXN"), q ? productSearchCondition(q) : undefined)).orderBy(asc(products.title), asc(inventoryItems.inventoryCode)).limit(41).offset((page - 1) * 40);
  const allLocations = await db.select().from(locations); const byId = new Map(allLocations.map(l => [l.id, l])); const path = createLocationBreadcrumbResolver(allLocations);
  const rows = result.slice(0, 40).filter(row => {
    let id = row.source.locationId; const seen = new Set<string>();
    while (id) { const l = byId.get(id); if (!l?.active || seen.has(id) || seen.size >= 64) return false; seen.add(id); id = l.parentId; }
    return true;
  }).map(row => ({ id: row.source.id, product: row.product, brand: row.brand, quantity: row.source.quantity, condition: row.source.condition, inventoryCode: row.source.inventoryCode, location: row.source.locationId ? path(row.source.locationId) : row.source.legacyLocationCode ?? "Sin ubicación", bag: row.source.legacyBagNumber,
    thumbnail: row.imageKey ? getR2PublicUrl(row.imageKey) : row.imageUrl && /^https?:\/\//u.test(row.imageUrl) ? row.imageUrl : null,
  }));
  return { rows, hasMore: result.length > 40 };
}
export type StockOption = Awaited<ReturnType<typeof searchSaleStock>>["rows"][number];
