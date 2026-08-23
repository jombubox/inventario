import "server-only";

import { and, asc, count, eq, isNull, max, ne, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { productImages, products } from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
import { assertPermission } from "@/features/auth/domain/permissions";
import type { AuthenticatedUser } from "@/features/auth/server/authorization";
import {
  allowedImageMimeTypes,
  assertSafeImageDescription,
  createProductImageObjectKey,
  imageSignatureHex,
  MAX_PRODUCT_IMAGES,
  safeImageFilename,
  type AllowedImageMimeType,
} from "@/features/images/domain/image-policy";
import type { ImageStorage } from "@/features/images/server/r2";
import { EntityNotFoundError, InvalidOperationError } from "@/features/shared/domain/service-errors";
import { logServerError } from "@/lib/observability";

export const R2_IMAGE_PROVIDER = "CLOUDFLARE_R2";

async function assertProductExists(db: Database, productId: string) {
  const product = await db.query.products.findFirst({
    columns: { id: true, title: true, sku: true },
    where: and(eq(products.id, productId), isNull(products.deletedAt)),
  });
  if (!product) throw new EntityNotFoundError("El producto no existe.");
  return product;
}

async function assertImageCapacity(db: Database, productId: string) {
  const [current] = await db
    .select({ value: count() })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  if ((current?.value ?? 0) >= MAX_PRODUCT_IMAGES) {
    throw new InvalidOperationError("El producto ya tiene el máximo de 10 imágenes.");
  }
}

export async function createProductImage(
  db: Database,
  actor: AuthenticatedUser,
  storage: ImageStorage,
  input: {
    productId: string;
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
    alt?: string | null;
  },
) {
  assertPermission(actor.role, "IMAGE_MANAGE");
  assertSafeImageDescription({
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.bytes.byteLength,
    signatureHex: imageSignatureHex(input.bytes),
  });
  const product = await assertProductExists(db, input.productId);
  await assertImageCapacity(db, input.productId);

  const mimeType = input.mimeType as AllowedImageMimeType;
  if (!allowedImageMimeTypes.includes(mimeType)) {
    throw new InvalidOperationError("El tipo de imagen no es válido.");
  }
  const objectKey = createProductImageObjectKey(product.sku, mimeType);
  await storage.putObject({ objectKey, body: input.bytes, contentType: mimeType });

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.productId}, 0))`);
      const currentProduct = await tx.query.products.findFirst({
        columns: { id: true, title: true },
        where: and(eq(products.id, input.productId), isNull(products.deletedAt)),
      });
      if (!currentProduct) throw new EntityNotFoundError("El producto no existe.");

      const [aggregate] = await tx
        .select({ value: count(), highestOrder: max(productImages.sortOrder) })
        .from(productImages)
        .where(eq(productImages.productId, input.productId));
      const imageCount = aggregate?.value ?? 0;
      if (imageCount >= MAX_PRODUCT_IMAGES) {
        throw new InvalidOperationError("El producto ya tiene el máximo de 10 imágenes.");
      }

      const [created] = await tx
        .insert(productImages)
        .values({
          productId: input.productId,
          provider: R2_IMAGE_PROVIDER,
          storageKey: objectKey,
          alt: input.alt?.trim() || currentProduct.title,
          sortOrder: (aggregate?.highestOrder ?? -1) + 1,
          isPrimary: imageCount === 0,
          metadata: {
            filename: safeImageFilename(input.filename),
            mimeType,
            size: input.bytes.byteLength,
            uploadedBy: actor.id,
          },
        })
        .returning();
      if (!created) throw new Error("No fue posible registrar la imagen.");

      await createAuditLog(tx, {
        userId: actor.id,
        action: "PRODUCT_IMAGE_ADDED",
        entityType: "PRODUCT_IMAGE",
        entityId: created.id,
        after: { productId: input.productId, objectKey, isPrimary: created.isPrimary },
      });
      return created;
    });
  } catch (error) {
    try {
      const registered = await db.query.productImages.findFirst({
        columns: { id: true },
        where: eq(productImages.storageKey, objectKey),
      });
      if (!registered) {
        await storage.deleteObject(objectKey);
      }
    } catch (cleanupError) {
      logServerError("r2_orphan_cleanup_failed", cleanupError, {
        objectKey,
        productId: input.productId,
      });
    }
    throw error;
  }
}

export async function updateProductImage(
  db: Database,
  actor: AuthenticatedUser,
  input: { imageId: string; alt?: string | null; makePrimary?: boolean },
) {
  assertPermission(actor.role, "IMAGE_MANAGE");
  return db.transaction(async (tx) => {
    const image = await tx.query.productImages.findFirst({ where: eq(productImages.id, input.imageId) });
    if (!image) throw new EntityNotFoundError("La imagen no existe.");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${image.productId}, 0))`);
    if (input.makePrimary) {
      await tx.update(productImages).set({ isPrimary: false, updatedAt: new Date() }).where(eq(productImages.productId, image.productId));
      await tx.update(productImages).set({ isPrimary: true, updatedAt: new Date() }).where(eq(productImages.id, image.id));
      await createAuditLog(tx, { userId: actor.id, action: "PRODUCT_PRIMARY_IMAGE_CHANGED", entityType: "PRODUCT_IMAGE", entityId: image.id, before: { isPrimary: image.isPrimary }, after: { isPrimary: true, productId: image.productId } });
    }
    if (input.alt !== undefined) {
      const alt = input.alt?.trim() || null;
      await tx.update(productImages).set({ alt, updatedAt: new Date() }).where(eq(productImages.id, image.id));
      await createAuditLog(tx, { userId: actor.id, action: "PRODUCT_IMAGE_ALT_UPDATED", entityType: "PRODUCT_IMAGE", entityId: image.id, before: { alt: image.alt }, after: { alt, productId: image.productId } });
    }
  });
}

export async function reorderProductImages(
  db: Database,
  actor: AuthenticatedUser,
  productId: string,
  imageIds: string[],
) {
  assertPermission(actor.role, "IMAGE_MANAGE");
  if (imageIds.length > MAX_PRODUCT_IMAGES || new Set(imageIds).size !== imageIds.length) {
    throw new InvalidOperationError("El orden de imágenes no es válido.");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${productId}, 0))`);
    const current = await tx.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId));
    if (current.length !== imageIds.length || current.some((image) => !imageIds.includes(image.id))) {
      throw new InvalidOperationError("La lista no coincide con las imágenes actuales.");
    }
    for (const [sortOrder, imageId] of imageIds.entries()) {
      await tx.update(productImages).set({ sortOrder, updatedAt: new Date() }).where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)));
    }
    await createAuditLog(tx, { userId: actor.id, action: "PRODUCT_IMAGE_REORDERED", entityType: "PRODUCT", entityId: productId, after: { imageIds } });
  });
}

export async function deleteProductImage(
  db: Database,
  actor: AuthenticatedUser,
  storage: ImageStorage,
  imageId: string,
) {
  assertPermission(actor.role, "IMAGE_MANAGE");
  const image = await db.query.productImages.findFirst({ where: eq(productImages.id, imageId) });
  if (!image) throw new EntityNotFoundError("La imagen no existe.");
  if (image.provider !== R2_IMAGE_PROVIDER || !image.storageKey) {
    throw new InvalidOperationError("Esta imagen heredada no tiene una clave de R2 y no puede eliminarse automáticamente.");
  }

  const [references] = await db
    .select({ value: count() })
    .from(productImages)
    .where(and(eq(productImages.storageKey, image.storageKey), ne(productImages.id, image.id)));
  if ((references?.value ?? 0) > 0) {
    throw new InvalidOperationError("La imagen todavía está referenciada por otro registro.");
  }

  const pendingMetadata = {
    ...(image.metadata ?? {}),
    deletionPending: true,
    deletionRequestedBy: actor.id,
  };
  await db
    .update(productImages)
    .set({ metadata: pendingMetadata, updatedAt: new Date() })
    .where(eq(productImages.id, image.id));

  await storage.deleteObject(image.storageKey);

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${image.productId}, 0))`);
    await tx.delete(productImages).where(eq(productImages.id, image.id));
    const remaining = await tx.select().from(productImages).where(eq(productImages.productId, image.productId)).orderBy(asc(productImages.sortOrder), asc(productImages.createdAt));
    for (const [sortOrder, item] of remaining.entries()) {
      await tx.update(productImages).set({ sortOrder, isPrimary: image.isPrimary ? sortOrder === 0 : item.isPrimary, updatedAt: new Date() }).where(eq(productImages.id, item.id));
    }
    await createAuditLog(tx, { userId: actor.id, action: "PRODUCT_IMAGE_REMOVED", entityType: "PRODUCT_IMAGE", entityId: image.id, before: { productId: image.productId, objectKey: image.storageKey, isPrimary: image.isPrimary } });
  });
}
