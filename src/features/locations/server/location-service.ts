import "server-only";

import { and, eq, ne } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { locations } from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
import { assertPermission } from "@/features/auth/domain/permissions";
import type { AuthenticatedUser } from "@/features/auth/server/authorization";
import { assertValidLocationParent } from "@/features/locations/domain/location-hierarchy";
import {
  ConcurrentModificationError,
  DuplicateEntityError,
  EntityNotFoundError,
} from "@/features/shared/domain/service-errors";
import type {
  CreateLocationMutationInput,
  UpdateLocationMutationInput,
} from "@/validators/admin-location";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function loadHierarchy(tx: Transaction) {
  return tx
    .select({ id: locations.id, name: locations.name, parentId: locations.parentId })
    .from(locations);
}

async function assertCodeAvailable(
  tx: Transaction,
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
  actor: AuthenticatedUser,
  input: CreateLocationMutationInput,
) {
  assertPermission(actor.role, "LOCATION_CREATE");
  return db.transaction(async (tx) => {
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
      userId: actor.id,
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
  });
}

export async function updateLocation(
  db: Database,
  actor: AuthenticatedUser,
  input: UpdateLocationMutationInput,
) {
  assertPermission(actor.role, "LOCATION_UPDATE");
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
      throw new ConcurrentModificationError("Location was modified by another user.");
    }

    await createAuditLog(tx, {
      userId: actor.id,
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
