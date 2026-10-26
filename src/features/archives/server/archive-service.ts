import "server-only";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/connection";
import { brands, componentTypes, products } from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
import type { ArchiveCategory } from "@/features/archives/domain/archives";
import { setLocationArchived } from "@/features/locations/server/location-service";
import { ConcurrentModificationError, EntityNotFoundError, InvalidOperationError } from "@/features/shared/domain/service-errors";

export async function restoreArchivedRecord(db: Database, input: { categoria: ArchiveCategory; id: string; expectedUpdatedAt: Date }) {
  if (input.categoria === "ubicaciones" || input.categoria === "cajas") {
    return setLocationArchived(db, input, false, input.categoria === "cajas" ? "BOX" : "OTHER_LOCATION");
  }
  return db.transaction(async (tx) => {
    if (input.categoria === "productos") {
      const [existing] = await tx.select().from(products).where(eq(products.id, input.id)).for("update");
      if (!existing) throw new EntityNotFoundError("El producto ya no existe.");
      if (existing.status !== "ARCHIVED" && !existing.deletedAt) throw new InvalidOperationError("El producto ya está restaurado.");
      if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new ConcurrentModificationError("El producto cambió.");
      const [brand] = await tx.select().from(brands).where(eq(brands.id, existing.brandId)).for("share");
      const [type] = await tx.select().from(componentTypes).where(eq(componentTypes.id, existing.componentTypeId)).for("share");
      if (!brand?.active || !type?.active) throw new InvalidOperationError("Restaura primero la marca y el tipo de pieza del producto.");
      const [restored] = await tx.update(products).set({ status: "DRAFT", isPublic: false, deletedAt: null, updatedAt: new Date() }).where(eq(products.id, input.id)).returning();
      await createAuditLog(tx, { action: "PRODUCT_RESTORED", entityType: "PRODUCT", entityId: input.id,
        before: { status: existing.status, isPublic: existing.isPublic, deletedAt: existing.deletedAt }, after: { status: "DRAFT", isPublic: false, deletedAt: null } });
      return restored;
    }
    const table = input.categoria === "marcas" ? brands : componentTypes;
    const [existing] = await tx.select().from(table).where(eq(table.id, input.id)).for("update");
    if (!existing) throw new EntityNotFoundError("El registro ya no existe.");
    if (existing.active) throw new InvalidOperationError("El registro ya está restaurado.");
    const [restored] = await tx.update(table).set({ active: true, updatedAt: new Date() })
      .where(and(eq(table.id, input.id), eq(table.updatedAt, input.expectedUpdatedAt))).returning();
    if (!restored) throw new ConcurrentModificationError("El registro cambió.");
    await createAuditLog(tx, { action: input.categoria === "marcas" ? "BRAND_RESTORED" : "COMPONENT_TYPE_RESTORED",
      entityType: input.categoria === "marcas" ? "BRAND" : "COMPONENT_TYPE", entityId: input.id,
      before: { active: false }, after: { active: true } });
    return restored;
  });
}
