import "server-only";

import { and, eq, gte, isNull, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  inventoryItems,
  inventoryMovements,
  locations,
  products,
} from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
import { assertPermission } from "@/features/auth/domain/permissions";
import { databaseUserIdForActor } from "@/features/auth/server/actor-attribution";
import type { AuthenticatedUser } from "@/features/auth/server/authorization";
import {
  ConcurrentModificationError,
  EntityNotFoundError,
  InvalidOperationError,
} from "@/features/shared/domain/service-errors";
import type {
  AdjustInventoryMutationInput,
  CreateInventoryMutationInput,
  UpdateInventoryDetailsMutationInput,
  StockMovementMutationInput,
} from "@/validators/admin-inventory";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function assertProductExists(tx: Transaction, productId: string): Promise<void> {
  const product = await tx.query.products.findFirst({
    columns: { id: true },
    where: and(eq(products.id, productId), isNull(products.deletedAt)),
  });
  if (!product) throw new EntityNotFoundError("Product not found.");
}

async function assertActiveLocation(tx: Transaction, locationId: string): Promise<void> {
  const location = await tx.query.locations.findFirst({
    columns: { id: true },
    where: and(eq(locations.id, locationId), eq(locations.active, true)),
  });
  if (!location) throw new EntityNotFoundError("Location not found or inactive.");
}

export async function createInventoryItemInTransaction(
  tx: Transaction,
  actor: AuthenticatedUser,
  input: CreateInventoryMutationInput,
) {
  assertPermission(actor.role, "INVENTORY_CREATE");
  await assertProductExists(tx, input.productId);
    if (input.locationId) await assertActiveLocation(tx, input.locationId);

    const [item] = await tx
      .insert(inventoryItems)
      .values({
        productId: input.productId,
        locationId: input.locationId,
        quantity: input.quantity,
        condition: input.condition,
        status: input.status,
        acquiredAt: input.acquiredAt,
        acquisitionSource: input.acquisitionSource,
        purchaseCost: input.purchaseCost,
        notes: input.notes,
        legacyBagNumber: input.legacyBagNumber,
        legacyLocationCode: input.legacyLocationCode,
      })
      .returning();
    if (!item) throw new Error("Inventory insert did not return a row.");

    await tx.insert(inventoryMovements).values({
      inventoryItemId: item.id,
      type: "INITIAL",
      quantity: item.quantity,
      toLocationId: item.locationId,
      userId: databaseUserIdForActor(actor.id),
      reason: "Registro inicial de inventario",
      metadata: {
        initialQuantity: item.quantity,
        initialStatus: item.status,
        actorId: actor.id,
      },
    });
    await createAuditLog(tx, {
      userId: actor.id,
      action: "INVENTORY_CREATED",
      entityType: "INVENTORY_ITEM",
      entityId: item.id,
      after: {
        inventoryCode: item.inventoryCode,
        productId: item.productId,
        locationId: item.locationId,
        quantity: item.quantity,
        condition: item.condition,
        status: item.status,
      },
    });

  return item;
}

export async function createInventoryItem(
  db: Database,
  actor: AuthenticatedUser,
  input: CreateInventoryMutationInput,
) {
  assertPermission(actor.role, "INVENTORY_CREATE");
  return db.transaction((tx) => createInventoryItemInTransaction(tx, actor, input));
}

export async function updateInventoryDetails(
  db: Database,
  actor: AuthenticatedUser,
  input: UpdateInventoryDetailsMutationInput,
) {
  assertPermission(actor.role, "INVENTORY_UPDATE");
  return db.transaction(async (tx) => {
    const existing = await tx.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, input.id),
    });
    if (!existing) throw new EntityNotFoundError("Inventory item not found.");

    const [updated] = await tx
      .update(inventoryItems)
      .set({
        condition: input.condition,
        acquiredAt: input.acquiredAt,
        acquisitionSource: input.acquisitionSource,
        purchaseCost: input.purchaseCost,
        notes: input.notes,
        legacyBagNumber: input.legacyBagNumber,
        legacyLocationCode: input.legacyLocationCode,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryItems.id, input.id),
          eq(inventoryItems.updatedAt, input.expectedUpdatedAt),
        ),
      )
      .returning();
    if (!updated) {
      throw new ConcurrentModificationError("Inventory item was modified by another user.");
    }

    await createAuditLog(tx, {
      userId: actor.id,
      action: "INVENTORY_UPDATED",
      entityType: "INVENTORY_ITEM",
      entityId: input.id,
      before: {
        condition: existing.condition,
        acquiredAt: existing.acquiredAt,
        acquisitionSource: existing.acquisitionSource,
        purchaseCost: existing.purchaseCost,
        notes: existing.notes,
      },
      after: {
        condition: updated.condition,
        acquiredAt: updated.acquiredAt,
        acquisitionSource: updated.acquisitionSource,
        purchaseCost: updated.purchaseCost,
        notes: updated.notes,
      },
    });

    return updated;
  });
}

export async function moveInventoryItem(
  db: Database,
  actor: AuthenticatedUser,
  input: { id: string; toLocationId: string; reason: string },
) {
  assertPermission(actor.role, "INVENTORY_MOVE");
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, input.id))
      .for("update")
      .limit(1);
    if (!item) throw new EntityNotFoundError("Inventory item not found.");
    if (item.locationId === input.toLocationId) {
      throw new InvalidOperationError("Inventory is already in that location.");
    }
    if (item.quantity <= 0) {
      throw new InvalidOperationError("Inventory without physical quantity cannot be moved.");
    }
    await assertActiveLocation(tx, input.toLocationId);

    const [updated] = await tx
      .update(inventoryItems)
      .set({ locationId: input.toLocationId, updatedAt: new Date() })
      .where(eq(inventoryItems.id, item.id))
      .returning();
    if (!updated) throw new Error("Inventory move did not return a row.");

    await tx.insert(inventoryMovements).values({
      inventoryItemId: item.id,
      type: "MOVE",
      quantity: item.quantity,
      fromLocationId: item.locationId,
      toLocationId: input.toLocationId,
      userId: databaseUserIdForActor(actor.id),
      reason: input.reason,
      metadata: { status: item.status, actorId: actor.id },
    });
    await createAuditLog(tx, {
      userId: actor.id,
      action: "INVENTORY_MOVED",
      entityType: "INVENTORY_ITEM",
      entityId: item.id,
      before: { locationId: item.locationId },
      after: { locationId: input.toLocationId },
      metadata: { quantity: item.quantity, reason: input.reason },
    });

    return updated;
  });
}

export async function adjustInventoryQuantity(
  db: Database,
  actor: AuthenticatedUser,
  input: AdjustInventoryMutationInput,
) {
  assertPermission(actor.role, "INVENTORY_UPDATE");
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, input.id))
      .for("update")
      .limit(1);
    if (!item) throw new EntityNotFoundError("Inventory item not found.");
    if (item.quantity === input.newQuantity) {
      throw new InvalidOperationError("The new quantity must be different.");
    }

    const delta = input.newQuantity - item.quantity;
    const [updated] = await tx
      .update(inventoryItems)
      .set({
        quantity: input.newQuantity,
        status: input.newStatus,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, item.id))
      .returning();
    if (!updated) throw new Error("Inventory adjustment did not return a row.");

    await tx.insert(inventoryMovements).values({
      inventoryItemId: item.id,
      type: "ADJUSTMENT",
      quantity: Math.abs(delta),
      userId: databaseUserIdForActor(actor.id),
      reason: input.reason,
      metadata: {
        fromQuantity: item.quantity,
        toQuantity: input.newQuantity,
        delta,
        fromStatus: item.status,
        toStatus: input.newStatus,
        actorId: actor.id,
      },
    });
    await createAuditLog(tx, {
      userId: actor.id,
      action: "INVENTORY_ADJUSTED",
      entityType: "INVENTORY_ITEM",
      entityId: item.id,
      before: { quantity: item.quantity, status: item.status },
      after: { quantity: input.newQuantity, status: input.newStatus },
      metadata: { delta, reason: input.reason },
    });

    return updated;
  });
}

export async function recordStockMovement(
  db: Database,
  actor: AuthenticatedUser,
  input: StockMovementMutationInput,
) {
  const increasing = input.type === "IN" || input.type === "RETURN";
  assertPermission(actor.role, increasing ? "INVENTORY_IN" : "INVENTORY_OUT");

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, input.id))
      .for("update")
      .limit(1);
    if (!before) throw new EntityNotFoundError("Inventory item not found.");
    if (
      !increasing &&
      (before.quantity < input.quantity || !["AVAILABLE", "RESERVED", "DAMAGED"].includes(before.status))
    ) {
      throw new InvalidOperationError(
        "La salida supera la cantidad física disponible o el registro ya está cerrado.",
      );
    }
    let updated: typeof inventoryItems.$inferSelect | undefined;
    if (increasing) {
      [updated] = await tx
        .update(inventoryItems)
        .set({
          quantity: sql`${inventoryItems.quantity} + ${input.quantity}`,
          status: input.resultingStatus,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, input.id))
        .returning();
    } else {
      [updated] = await tx
        .update(inventoryItems)
        .set({
          quantity: sql`${inventoryItems.quantity} - ${input.quantity}`,
          status: sql`case when ${inventoryItems.quantity} - ${input.quantity} = 0 then ${input.resultingStatus}::inventory_status else ${inventoryItems.status} end`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inventoryItems.id, input.id),
            gte(inventoryItems.quantity, input.quantity),
            sql`${inventoryItems.status} in ('AVAILABLE', 'RESERVED', 'DAMAGED')`,
          ),
        )
        .returning();
    }

    if (!updated) {
      throw new InvalidOperationError("No fue posible registrar el movimiento de stock.");
    }

    await tx.insert(inventoryMovements).values({
      inventoryItemId: updated.id,
      type: input.type,
      quantity: input.quantity,
      fromLocationId: increasing ? null : updated.locationId,
      toLocationId: increasing ? updated.locationId : null,
      userId: databaseUserIdForActor(actor.id),
      reason: input.reason,
      metadata: {
        direction: increasing ? "IN" : "OUT",
        fromQuantity: before.quantity,
        toQuantity: updated.quantity,
        resultingStatus: updated.status,
        actorId: actor.id,
      },
    });
    const action = {
      IN: "INVENTORY_IN",
      OUT: "INVENTORY_OUT",
      SALE: "INVENTORY_SALE",
      RETURN: "INVENTORY_RETURN",
    } as const;
    await createAuditLog(tx, {
      userId: actor.id,
      action: action[input.type],
      entityType: "INVENTORY_ITEM",
      entityId: updated.id,
      before: { quantity: before.quantity, status: before.status },
      after: { quantity: updated.quantity, status: updated.status },
      metadata: { movementType: input.type, quantity: input.quantity, reason: input.reason },
    });
    return updated;
  });
}
