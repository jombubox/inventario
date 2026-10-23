import "server-only";

import { and, count, eq, ne, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { inventoryItems, locations } from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
import { assertValidLocationParent } from "@/features/locations/domain/location-hierarchy";
import { isQuickAddContainer } from "@/features/locations/domain/quick-add-location";
import {
  ConcurrentModificationError,
  DuplicateEntityError,
  EntityNotFoundError,
  InvalidOperationError,
} from "@/features/shared/domain/service-errors";
import type {
  CreateLocationMutationInput,
  UpdateLocationMutationInput,
} from "@/validators/admin-location";
import type { DeleteBoxMutationInput } from "@/validators/quick-add-inventory";

export type LocationTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function loadHierarchy(tx: LocationTransaction) {
  return tx
    .select({ id: locations.id, name: locations.name, parentId: locations.parentId })
    .from(locations);
}

async function assertCodeAvailable(
  tx: LocationTransaction,
  code: string,
  excludingId?: string,
): Promise<void> {
  const where = excludingId
    ? and(eq(locations.code, code), ne(locations.id, excludingId))
    : eq(locations.code, code);
  const collision = await tx.query.locations.findFirst({
    columns: { id: true },
    where,
  });
  if (collision) throw new DuplicateEntityError("Location code already exists.");
}

export async function createLocation(
  db: Database,
  input: CreateLocationMutationInput,
) {
  return db.transaction((tx) => createLocationInTransaction(tx, input));
}

export async function createLocationInTransaction(
  tx: LocationTransaction,
  input: CreateLocationMutationInput,
) {
  await assertCodeAvailable(tx, input.code);
  if (input.parentId) {
    await assertActiveParent(tx, input.parentId);
  }

  const [location] = await tx.insert(locations).values(input).returning();
  if (!location) throw new Error("Location insert did not return a row.");
  await createAuditLog(tx, {
    action: "LOCATION_CREATED",
    entityType: "LOCATION",
    entityId: location.id,
    after: {
      code: location.code,
      name: location.name,
      type: location.type,
      parentId: location.parentId,
      active: location.active,
    },
  });
  return location;
}

export async function updateLocation(
  db: Database,
  input: UpdateLocationMutationInput,
) {
  return db.transaction((tx) => updateLocationInTransaction(tx, input));
}

export async function renameQuickAddLocation(
  db: Database,
  input: { id: string; name: string; expectedUpdatedAt: Date },
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(locations)
      .where(eq(locations.id, input.id)).for("update").limit(1);
    if (!existing || !isQuickAddContainer(existing)) {
      throw new EntityNotFoundError("La ubicación ya no existe o está inactiva.");
    }
    return updateLocationInTransaction(tx, { ...existing, ...input });
  });
}

async function updateLocationInTransaction(
  tx: LocationTransaction,
  input: UpdateLocationMutationInput,
) {
    const [existing] = await tx.select().from(locations).where(eq(locations.id, input.id)).for("update");
    if (!existing) throw new EntityNotFoundError("Location not found.");
    if (!existing.active) throw new InvalidOperationError("Restaura esta ubicación desde Archivados antes de editarla.");
    if (input.parentId) await assertActiveParent(tx, input.parentId);
    if (!input.active) await assertLocationEmpty(tx, input.id);
    await assertCodeAvailable(tx, input.code, input.id);
    const hierarchy = await loadHierarchy(tx);
    assertValidLocationParent({
      locationId: input.id,
      nextParentId: input.parentId,
      locations: hierarchy,
    });

    const [updated] = await tx
      .update(locations)
      .set({
        code: input.code,
        name: input.name,
        type: input.type,
        parentId: input.parentId,
        active: input.active,
        notes: input.notes,
        updatedAt: new Date(),
      })
      .where(
        and(eq(locations.id, input.id), eq(locations.updatedAt, input.expectedUpdatedAt)),
      )
      .returning();
    if (!updated) {
      throw new ConcurrentModificationError("Location was modified by another operation.");
    }

    await createAuditLog(tx, {
      action: input.active ? "LOCATION_UPDATED" : "LOCATION_ARCHIVED",
      entityType: "LOCATION",
      entityId: input.id,
      before: {
        code: existing.code,
        name: existing.name,
        type: existing.type,
        parentId: existing.parentId,
        active: existing.active,
      },
      after: {
        code: updated.code,
        name: updated.name,
        type: updated.type,
        parentId: updated.parentId,
        active: updated.active,
      },
    });
    return updated;
}


// Parent share locks serialize child creation/restoration with parent archival.
async function assertActiveParent(tx: LocationTransaction, id: string) {
  const visited = new Set<string>();
  let current: string | null = id;
  while (current) {
    if (visited.has(current)) throw new InvalidOperationError("La jerarquía de ubicaciones contiene un ciclo. Revisa sus relaciones antes de restaurar.");
    visited.add(current);
    const [parent]: (typeof locations.$inferSelect)[] = await tx.select().from(locations).where(eq(locations.id, current)).for("share");
    if (!parent?.active) throw new InvalidOperationError("La ubicación padre está archivada. Restáurala primero.");
    current = parent.parentId;
  }
}

async function assertLocationEmpty(tx: LocationTransaction, id: string) {
  const [stock] = await tx.select({ units: sql<number>`coalesce(sum(case when ${inventoryItems.status} in ('AVAILABLE', 'RESERVED', 'DAMAGED') then ${inventoryItems.quantity} else 0 end), 0)::int` }).from(inventoryItems).where(sql`${inventoryItems.locationId} in (
    with recursive subtree(id) as (
      select ${locations.id} from ${locations} where ${locations.id} = ${id}
      union select child.id from ${locations} child inner join subtree on child.parent_id = subtree.id
    ) select id from subtree
  )`);
  if (stock && stock.units > 0) throw new InvalidOperationError(`No puedes archivar esta ubicación porque contiene ${stock.units} unidad(es) de inventario. Mueve o da salida al stock primero.`);
  const [children] = await tx.select({ rows: count() }).from(locations).where(and(eq(locations.parentId, id), eq(locations.active, true)));
  if (children && children.rows > 0) throw new InvalidOperationError(`No puedes archivar esta ubicación porque contiene ${children.rows} ubicación(es) hija(s) activa(s). Archívalas o reubícalas primero.`);
}

export async function setLocationArchived(db: Database, input: { id: string; expectedUpdatedAt: Date }, archived: boolean, kind?: "BOX" | "OTHER_LOCATION") {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(locations).where(eq(locations.id, input.id)).for("update");
    if (!existing) throw new EntityNotFoundError("La ubicación ya no existe.");
    if ((kind === "BOX" && existing.type !== "BOX") || (kind === "OTHER_LOCATION" && existing.type === "BOX")) throw new InvalidOperationError("La ubicación no pertenece a esta categoría.");
    if (existing.active === !archived) throw new InvalidOperationError(archived ? "La ubicación ya está archivada." : "La ubicación ya está restaurada.");
    if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new ConcurrentModificationError("La ubicación cambió.");
    if (archived) await assertLocationEmpty(tx, existing.id);
    else if (existing.parentId) await assertActiveParent(tx, existing.parentId);
    const [updated] = await tx.update(locations).set({ active: !archived, updatedAt: new Date() }).where(eq(locations.id, input.id)).returning();
    if (!updated) throw new ConcurrentModificationError("La ubicación cambió.");
    await createAuditLog(tx, { action: archived ? "LOCATION_ARCHIVED" : "LOCATION_RESTORED", entityType: "LOCATION", entityId: input.id,
      before: { code: existing.code, name: existing.name, parentId: existing.parentId, active: existing.active },
      after: { code: updated.code, name: updated.name, parentId: updated.parentId, active: updated.active } });
    return updated;
  });
}

// Retain the existing service entry point; empty boxes now keep their IDs and history too.
export async function deleteBox(db: Database, input: DeleteBoxMutationInput) {
  const box = await setLocationArchived(db, input, true, "BOX");
  return { mode: "archived" as const, box };
}
