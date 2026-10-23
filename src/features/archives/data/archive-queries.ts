import "server-only";
import { and, asc, count, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import { brands, componentTypes, inventoryItems, locations, products } from "@/db/schema";
import type { ArchiveCategory } from "@/features/archives/domain/archives";
import { productSearchCondition, searchPattern } from "@/features/products/data/product-search";
import { ilike } from "drizzle-orm";

export const archivedProductCondition = or(eq(products.status, "ARCHIVED"), isNotNull(products.deletedAt))!;
export async function getArchiveCounts(db: Database): Promise<Record<ArchiveCategory, number>> {
  const [p, b, t, l] = await Promise.all([
    db.select({ value: count() }).from(products).where(archivedProductCondition),
    db.select({ value: count() }).from(brands).where(eq(brands.active, false)),
    db.select({ value: count() }).from(componentTypes).where(eq(componentTypes.active, false)),
    db.select({ type: locations.type, value: count() }).from(locations).where(eq(locations.active, false)).groupBy(locations.type),
  ]);
  return { productos: p[0]?.value ?? 0, marcas: b[0]?.value ?? 0, tipos: t[0]?.value ?? 0,
    cajas: l.find((row) => row.type === "BOX")?.value ?? 0,
    ubicaciones: l.filter((row) => row.type !== "BOX").reduce((total, row) => total + row.value, 0) };
}

export async function listArchivedRecords(db: Database, category: ArchiveCategory, query: string, requestedPage: number) {
  const pattern = searchPattern(query);
  const pageSize = 20;
  if (category === "productos") {
    const where = and(archivedProductCondition, query ? productSearchCondition(query) : undefined);
    const totalRows = await db.select({ value: count() }).from(products).innerJoin(brands, eq(products.brandId, brands.id)).innerJoin(componentTypes, eq(products.componentTypeId, componentTypes.id)).where(where);
    const total = totalRows[0]?.value ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pageCount);
    const rows = await db.select({ id: products.id, name: products.title, code: products.sku, updatedAt: products.updatedAt,
      detail: sql<string>`${brands.name} || ' · ' || coalesce(${products.partNumber}, 'Sin número de parte')` })
      .from(products).innerJoin(brands, eq(products.brandId, brands.id)).innerJoin(componentTypes, eq(products.componentTypeId, componentTypes.id))
      .where(where).orderBy(asc(products.title), asc(products.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total, page, pageCount };
  }
  const table = category === "marcas" ? brands : category === "tipos" ? componentTypes : locations;
  const where = and(eq(table.active, false),
    table === locations ? (category === "cajas" ? eq(locations.type, "BOX") : ne(locations.type, "BOX")) : undefined,
    query ? or(ilike(table.name, pattern), ilike(table.code, pattern)) : undefined);
  const totalRows = await db.select({ value: count() }).from(table).where(where);
  const total = totalRows[0]?.value ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const detail = table === locations
    ? sql<string>`coalesce((select parent.name from ${locations} parent where parent.id = ${locations.parentId}), 'Sin ubicación padre') || ' · ' || (select count(*)::text from ${inventoryItems} i where i.location_id = ${locations.id}) || ' registro(s) de inventario'`
    : table === brands
      ? sql<string>`(select count(*)::text from ${products} p where p.brand_id = ${brands.id}) || ' producto(s)'`
      : sql<string>`(select count(*)::text from ${products} p where p.component_type_id = ${componentTypes.id}) || ' producto(s)'`;
  const rows = await db.select({ id: table.id, name: table.name, code: table.code, updatedAt: table.updatedAt, detail }).from(table).where(where)
    .orderBy(asc(table.name), asc(table.id)).limit(pageSize).offset((page - 1) * pageSize);
  return { rows, total, page, pageCount };
}
