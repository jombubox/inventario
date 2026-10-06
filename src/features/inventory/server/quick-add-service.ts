import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { inventoryItems, locations, products } from "@/db/schema";
import { createInventoryItemInTransaction, recordStockMovementInTransaction } from "@/features/inventory/server/inventory-service";
import { createLocationInTransaction } from "@/features/locations/server/location-service";
import {
  isQuickAddContainer,
  UNPARENTED_BOXES_LOCATION_ID,
} from "@/features/locations/domain/quick-add-location";
import { createProductInTransaction } from "@/features/products/server/product-service";
import {
  DuplicateEntityError,
  EntityNotFoundError,
  InvalidOperationError,
} from "@/features/shared/domain/service-errors";
import {
  normalizeComparableText,
  normalizeWhitespace,
} from "@/features/shared/domain/text-normalization";
import { quickAddInventoryMutationSchema, type QuickAddInventoryMutationInput } from "@/validators/quick-add-inventory";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function resolveProduct(
  tx: Transaction,
  input: QuickAddInventoryMutationInput,
) {
  if (input.productMode === "existing") {
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, input.productId), sql`${products.deletedAt} is null`))
      .for("update")
      .limit(1);
    if (!product) throw new EntityNotFoundError("El producto seleccionado ya no existe.");
    return { product, created: false };
  }

  if (!input.brandId || !input.componentTypeId) {
    throw new InvalidOperationError("Completa la marca y el tipo de pieza.");
  }

  try {
    const product = await createProductInTransaction(tx, {
      brandId: input.brandId,
      customBrandName: input.customBrandName,
      componentTypeId: input.componentTypeId,
      customComponentTypeName: input.customComponentTypeName,
      partNumber: input.partNumber,
      primarySerialNumber: input.primarySerialNumber,
      secondarySerialNumbers: input.secondarySerialNumbers,
      title: input.title,
      description: null,
      salePrice: input.salePrice,
      condition: input.condition ?? "NEW",
      currency: input.currency,
      status: input.status,
      isPublic: input.isPublic,
      compatibilities: input.compatibilities,
    });
    return { product, created: true };
  } catch (error) {
    if (error instanceof DuplicateEntityError) {
      throw new InvalidOperationError(
        "Ya existe un producto con la misma identidad. Búscalo y usa ese producto para evitar duplicados.",
      );
    }
    throw error;
  }
}

async function assertStorageLocation(tx: Transaction, locationId: string) {
  const [location] = await tx
    .select()
    .from(locations)
    .where(eq(locations.id, locationId))
    .for("update")
    .limit(1);
  if (!location || !isQuickAddContainer(location)) {
    if (!location || !location.active) {
      throw new EntityNotFoundError("La ubicación ya no existe o está inactiva.");
    }
    throw new InvalidOperationError("Selecciona una ubicación contenedora para la caja.");
  }
  return location;
}

async function resolveBox(
  tx: Transaction,
  input: QuickAddInventoryMutationInput,
) {
  if (input.locationId === UNPARENTED_BOXES_LOCATION_ID) {
    if (input.boxMode !== "existing" || !input.boxId) {
      throw new InvalidOperationError(
        "Crea una ubicación contenedora antes de agregar una caja nueva.",
      );
    }
    const [box] = await tx
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, input.boxId),
          isNull(locations.parentId),
          eq(locations.type, "BOX"),
          eq(locations.active, true),
        ),
      )
      .for("update")
      .limit(1);
    if (!box) {
      throw new EntityNotFoundError(
        "La caja cambió, fue eliminada o ya tiene otra ubicación padre.",
      );
    }
    return { box, created: false };
  }

  await assertStorageLocation(tx, input.locationId);

  if (input.boxMode === "existing") {
    const [box] = await tx
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, input.boxId!),
          eq(locations.parentId, input.locationId),
          eq(locations.type, "BOX"),
          eq(locations.active, true),
        ),
      )
      .for("update")
      .limit(1);
    if (!box) {
      throw new EntityNotFoundError(
        "La caja cambió, fue eliminada o ya no pertenece a esa ubicación.",
      );
    }
    return { box, created: false };
  }

  const code = input.newBoxCode!;
  const name = input.newBoxName!;
  const normalizedCode = normalizeComparableText(code);
  const normalizedName = normalizeComparableText(name);

  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`quick-box:${normalizedCode}`}, 0))`,
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`quick-box-name:${input.locationId}:${normalizedName}`}, 0))`,
  );
  const [collision] = await tx
    .select({ id: locations.id, code: locations.code, name: locations.name })
    .from(locations)
    .where(
      sql`upper(btrim(${locations.code})) = ${normalizedCode}
        or (${locations.parentId} = ${input.locationId} and upper(btrim(${locations.name})) = ${normalizedName})`,
    )
    .limit(1);
  if (collision) {
    throw new InvalidOperationError(
      `La caja ${collision.code} · ${collision.name} ya existe. Selecciónala en lugar de crear otra.`,
    );
  }

  const box = await createLocationInTransaction(tx, {
    code,
    name,
    type: "BOX",
    parentId: input.locationId,
    active: true,
    notes: null,
  });
  return { box, created: true };
}

async function addStock(
  tx: Transaction,
  input: QuickAddInventoryMutationInput,
  productId: string,
  boxId: string,
) {
  const bagLabel = input.bagLabel
    ? normalizeWhitespace(input.bagLabel) || null
    : null;
  const normalizedBag = bagLabel?.toLocaleUpperCase("es-MX") ?? "";
  const stockKey = `quick-stock:${productId}:${boxId}:${normalizedBag}`;
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${stockKey}, 0))`,
  );

  const [existing] = await tx
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.productId, productId),
        eq(inventoryItems.locationId, boxId),
        eq(inventoryItems.condition, "UNKNOWN"),
        eq(inventoryItems.status, "AVAILABLE"),
        sql`coalesce(upper(regexp_replace(btrim(${inventoryItems.legacyBagNumber}), '[[:space:]]+', ' ', 'g')), '') = ${normalizedBag}`,
      ),
    )
    .orderBy(asc(inventoryItems.createdAt))
    .for("update")
    .limit(1);

  if (existing) {
    const item = await recordStockMovementInTransaction(tx, {
      id: existing.id,
      type: "IN",
      quantity: input.quantity,
      resultingStatus: "AVAILABLE",
      reason: "Entrada rápida de inventario",
    });
    return { item, created: false };
  }

  const item = await createInventoryItemInTransaction(tx, {
    productId,
    locationId: boxId,
    quantity: input.quantity,
    condition: "UNKNOWN",
    status: "AVAILABLE",
    acquiredAt: null,
    acquisitionSource: null,
    purchaseCost: null,
    notes: null,
    legacyBagNumber: bagLabel,
    legacyLocationCode: null,
  });
  return { item, created: true };
}

export async function quickAddInventory(
  db: Database,
  input: QuickAddInventoryMutationInput,
) {
  // Also enforce the contract for service callers outside the Server Action.
  input = quickAddInventoryMutationSchema.parse(input);
  return db.transaction(async (tx) => {
    const { product, created: productCreated } = await resolveProduct(tx, input);
    const { box, created: boxCreated } = await resolveBox(tx, input);
    const { item, created: inventoryCreated } = await addStock(
      tx,
      input,
      product.id,
      box.id,
    );

    const parent = box.parentId
      ? await tx.query.locations.findFirst({ columns: { name: true }, where: eq(locations.id, box.parentId) })
      : null;
    return {
      product,
      box,
      item,
      productCreated,
      boxCreated,
      inventoryCreated,
      locationName: parent?.name ?? "Cajas sin ubicación padre",
    };
  });
}
