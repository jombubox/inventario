import { ilike, or, sql } from "drizzle-orm";
import { brands, componentTypes, productCompatibilities, productSerialNumbers, products } from "@/db/schema";
import { normalizeIdentifier } from "@/features/shared/domain/text-normalization";
import { normalizeSerialNumber } from "@/features/products/domain/serial-number";

export function searchPattern(value: string) {
  return `%${value.replace(/[\\%_]/gu, "\\$&")}%`;
}

export function productSearchCondition(query: string) {
  const pattern = searchPattern(query);
  const identifier = normalizeIdentifier(query);
  const serial = searchPattern(normalizeSerialNumber(query));
  return or(
    ilike(products.sku, pattern), ilike(products.title, pattern), ilike(products.partNumber, pattern),
    identifier ? ilike(products.normalizedPartNumber, searchPattern(identifier)) : undefined,
    sql`exists (select 1 from ${brands} b where b.id = ${products.brandId} and b.name ilike ${pattern})`,
    sql`exists (select 1 from ${componentTypes} ct where ct.id = ${products.componentTypeId} and ct.name ilike ${pattern})`,
    sql`exists (select 1 from ${productSerialNumbers} psn where psn.product_id = ${products.id} and (psn.serial_number ilike ${pattern} or psn.normalized_serial_number ilike ${serial}))`,
    sql`exists (select 1 from ${productCompatibilities} pc where pc.product_id = ${products.id} and (pc.model ilike ${pattern} ${identifier ? sql`or pc.normalized_model ilike ${searchPattern(identifier)}` : sql``}))`,
  )!;
}
