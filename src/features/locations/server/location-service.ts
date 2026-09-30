import "server-only";

import { and, count, eq, ne, or, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { inventoryItems, inventoryMovements, locations } from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
import { assertValidLocationParent } from "@/features/locations/domain/location-hierarchy";
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
    const parent = await tx.query.locations.findFirst({
      columns: { id: true },
      where: eq(locations.id, input.parentId),
    });
    if (!parent) throw new EntityNotFoundError("Parent location not found.");
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
  return db.transaction(async (tx) => {
    const existing = await tx.query.locations.findFirst({
      where: eq(locations.id, input.id),
    });
    if (!existing) throw new EntityNotFoundError("Location not found.");
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
      action: "LOCATION_UPDATED",
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
  });
}

export async function deleteBox(db: Database, input: DeleteBoxMutationInput) {
  return db.transaction(async (tx) => {
    const [box] = await tx
      .select()
      .from(locations)
      .where(eq(locations.id, input.id))
      .for("update")
      .limit(1);
    if (!box) throw new EntityNotFoundError("La caja ya no existe.");
    if (box.type !== "BOX") {
      throw new InvalidOperationError("Solo las cajas pueden eliminarse desde esta acción.");
    }
    if (box.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      throw new ConcurrentModificationError("La caja fue modificada por otra operación.");
    }

    const inventorySummary = await tx
      .select({
        rows: count(),
        units: sql<number>`coalesce(sum(case when ${inventoryItems.status} in ('AVAILABLE', 'RESERVED', 'DAMAGED') then ${inventoryItems.quantity} else 0 end), 0)::int`,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.locationId, box.id));
    const childSummary = await tx
      .select({ rows: count() })
      .from(locations)
      .where(eq(locations.parentId, box.id));
    const movementSummary = await tx
      .select({ rows: count() })
      .from(inventoryMovements)
      .where(
        or(
          eq(inventoryMovements.fromLocationId, box.id),
          eq(inventoryMovements.toLocationId, box.id),
        ),
      );
    const inventoryRows = inventorySummary[0]?.rows ?? 0;
    const units = inventorySummary[0]?.units ?? 0;
    const children = childSummary[0]?.rows ?? 0;
    const movements = movementSummary[0]?.rows ?? 0;

    if (units > 0) {
      throw new InvalidOperationError(
        `No puedes eliminar esta caja porque todavía contiene ${units} unidad(es) de inventario. Mueve o da salida al stock primero.`,
      );
    }
    if (children > 0) {
      throw new InvalidOperationError(
        `No puedes eliminar esta caja porque contiene ${children} ubicación(es) hija(s). Reubícalas primero.`,
      );
    }

    if (inventoryRows > 0 || movements > 0) {
      const [archived] = await tx
        .update(locations)
        .set({ active: false, updatedAt: new Date() })
        .where(and(eq(locations.id, box.id), eq(locations.updatedAt, input.expectedUpdatedAt)))
        .returning();
      if (!archived) {
        throw new ConcurrentModificationError("La caja fue modificada por otra operación.");
      }
      await createAuditLog(tx, {
        action: "LOCATION_ARCHIVED",
        entityType: "LOCATION",
        entityId: box.id,
        before: { code: box.code, name: box.name, active: box.active },
        after: { code: archived.code, name: archived.name, active: false },
        metadata: { inventoryRows, movements, reason: "history_preserved" },
      });
      return { mode: "archived" as const, box: archived };
    }

    const [deleted] = await tx
      .delete(locations)
      .where(and(eq(locations.id, box.id), eq(locations.updatedAt, input.expectedUpdatedAt)))
      .returning();
    if (!deleted) {
      throw new ConcurrentModificationError("La caja fue modificada por otra operación.");
    }
    await createAuditLog(tx, {
      action: "LOCATION_DELETED",
      entityType: "LOCATION",
      entityId: box.id,
      before: {
        code: box.code,
        name: box.name,
        type: box.type,
        parentId: box.parentId,
        active: box.active,
      },
      after: null,
    });
    return { mode: "deleted" as const, box: deleted };
  });
}
