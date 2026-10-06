import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import { brands, productCompatibilities } from "@/db/schema";
import { modelFromQuery } from "@/features/products/domain/compatible-model";
import { normalizeModel } from "@/features/products/domain/product-normalization";
import { InvalidOperationError } from "@/features/shared/domain/service-errors";
import { compatibilityMutationSchema } from "@/validators/admin-product";

// Models belong to product_compatibilities, not a standalone catalog. Resolve a
// draft here; its association is persisted with the product in the save transaction.
export async function resolveCompatibleModel(db: Database, input: { brandId: string; model: string }) {
  const parsed = compatibilityMutationSchema.parse(input);
  const brand = await db.query.brands.findFirst({
    columns: { id: true, name: true },
    where: and(eq(brands.id, parsed.brandId), eq(brands.active, true)),
  });
  if (!brand) throw new InvalidOperationError("Esta marca ya no está disponible.");
  const model = modelFromQuery(parsed.model, brand.name);
  const normalizedModel = normalizeModel(model);
  if (!normalizedModel) throw new InvalidOperationError("Escribe un modelo válido.");
  const [existing] = await db.select({ model: sql<string>`min(${productCompatibilities.model})` })
    .from(productCompatibilities)
    .where(and(eq(productCompatibilities.brandId, brand.id), eq(productCompatibilities.normalizedModel, normalizedModel)))
    .groupBy(productCompatibilities.brandId, productCompatibilities.normalizedModel);
  return { compatibility: { brandId: brand.id, model: existing?.model ?? model, notes: null }, reused: !!existing };
}
