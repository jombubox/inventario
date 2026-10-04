import "server-only";

import { and, asc, count, desc, eq, isNull, ne, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { productImages, products } from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
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

type ImageTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function saveImageOrder(tx: ImageTransaction, productId: string, imageIds: string[]) {
  // Clear first so the existing unique partial primary index remains satisfied.
  await tx.update(productImages).set({ isPrimary: false, updatedAt: new Date() }).where(eq(productImages.productId, productId));
  for (const [sortOrder, imageId] of imageIds.entries()) {
    await tx.update(productImages).set({ sortOrder, isPrimary: sortOrder === 0, updatedAt: new Date() }).where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)));
  }
}

function currentImages(tx: ImageTransaction, productId: string) {
  return tx.select().from(productImages).where(eq(productImages.productId, productId))
    .orderBy(desc(productImages.isPrimary), asc(productImages.sortOrder), asc(productImages.createdAt), asc(productImages.id));
}

export async function createProductImage(
  db: Database,
  storage: ImageStorage,
  input: {
    productId: string;
    uploadId?: string;
    objectToken?: string;
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
    alt?: string | null;
    batchId?: string;
    position?: number;
  },
) {
  try {
    assertSafeImageDescription({
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      signatureHex: imageSignatureHex(input.bytes),
    });
  } catch (error) {
    throw new InvalidOperationError(
      error instanceof Error ? error.message : "La imagen no es válida.",
    );
  }
  const product = await assertProductExists(db, input.productId);


  const mimeType = input.mimeType as AllowedImageMimeType;
  if (!allowedImageMimeTypes.includes(mimeType)) {
    throw new InvalidOperationError("El tipo de imagen no es válido.");
  }
  const objectKey = createProductImageObjectKey(product.sku, mimeType, input.objectToken ?? input.uploadId);
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(input.bytes).buffer);
  const fingerprint = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.productId}, 0))`);
      const currentProduct = await tx.query.products.findFirst({
        columns: { id: true, title: true },
        where: and(eq(products.id, input.productId), isNull(products.deletedAt)),
      });
      if (!currentProduct) throw new EntityNotFoundError("El producto no existe.");

      if (input.uploadId) {
        const existing = await tx.query.productImages.findFirst({ where: eq(productImages.id, input.uploadId) });
        if (existing) {
          if (existing.productId !== input.productId || existing.metadata?.fingerprint !== fingerprint || existing.metadata?.mimeType !== mimeType) {
            throw new InvalidOperationError("La selección de foto cambió. Selecciona el archivo de nuevo.");
          }
          return existing;
        }
      }
      const current = await currentImages(tx, input.productId);
      const imageCount = current.length;
      if (imageCount >= MAX_PRODUCT_IMAGES) throw new InvalidOperationError("El producto ya tiene el máximo de 10 imágenes.");
      // Serialize storage and DB registration with mutations and other retries.
      await storage.putObject({ objectKey, body: input.bytes, contentType: mimeType });
      await saveImageOrder(tx, input.productId, current.map(({ id }) => id));
      const [created] = await tx
        .insert(productImages)
        .values({
          id: input.uploadId,
          productId: input.productId,
          provider: R2_IMAGE_PROVIDER,
          storageKey: objectKey,
          alt: input.alt?.trim() || currentProduct.title,
          sortOrder: imageCount,
          isPrimary: imageCount === 0,
          metadata: {
            filename: safeImageFilename(input.filename),
            mimeType,
            size: input.bytes.byteLength,
            fingerprint,
            ...(input.batchId ? { uploadBatchId: input.batchId, selectionOrder: input.position } : {}),
          },
        })
        .returning();
      if (!created) throw new Error("No fue posible registrar la imagen.");

      if (input.batchId) {
        // A failed photo does not block later photos; retry restores its selected position.
        const batch = [...current, created].filter((image) => image.metadata?.uploadBatchId === input.batchId)
          .sort((left, right) => Number(left.metadata?.selectionOrder) - Number(right.metadata?.selectionOrder));
        const firstBatchIndex = current.findIndex((image) => image.metadata?.uploadBatchId === input.batchId);
        const others = current.filter((image) => image.metadata?.uploadBatchId !== input.batchId).map(({ id }) => id);
        others.splice(firstBatchIndex < 0 ? others.length : firstBatchIndex, 0, ...batch.map(({ id }) => id));
        await saveImageOrder(tx, input.productId, others);
        created.sortOrder = others.indexOf(created.id);
        created.isPrimary = created.sortOrder === 0;
      }

      await createAuditLog(tx, {
        action: "PRODUCT_IMAGE_ADDED",
        entityType: "PRODUCT_IMAGE",
        entityId: created.id,
        after: { productId: input.productId, objectKey, isPrimary: created.isPrimary },
      });
      return created;
    });
  } catch (error) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.productId}, 0))`);
        const registered = await tx.query.productImages.findFirst({
          columns: { id: true }, where: eq(productImages.storageKey, objectKey),
        });
        if (!registered) await storage.deleteObject(objectKey);
      });
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
  input: { imageId: string; alt?: string | null; makePrimary?: boolean },
) {
  return db.transaction(async (tx) => {
    const image = await tx.query.productImages.findFirst({ where: eq(productImages.id, input.imageId) });
    if (!image) throw new EntityNotFoundError("La imagen no existe.");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${image.productId}, 0))`);
    if (input.makePrimary) {
      const current = await currentImages(tx, image.productId);
      if (!current.some(({ id }) => id === image.id)) throw new EntityNotFoundError("La imagen no existe.");
      await saveImageOrder(tx, image.productId, [image.id, ...current.filter(({ id }) => id !== image.id).map(({ id }) => id)]);
      await createAuditLog(tx, { action: "PRODUCT_PRIMARY_IMAGE_CHANGED", entityType: "PRODUCT_IMAGE", entityId: image.id, before: { isPrimary: image.isPrimary }, after: { isPrimary: true, productId: image.productId } });
    }
    if (input.alt !== undefined) {
      const alt = input.alt?.trim() || null;
      await tx.update(productImages).set({ alt, updatedAt: new Date() }).where(eq(productImages.id, image.id));
      await createAuditLog(tx, { action: "PRODUCT_IMAGE_ALT_UPDATED", entityType: "PRODUCT_IMAGE", entityId: image.id, before: { alt: image.alt }, after: { alt, productId: image.productId } });
    }
    return image.productId;
  });
}

export async function reorderProductImages(
  db: Database,
  productId: string,
  imageIds: string[],
) {
  if (imageIds.length > MAX_PRODUCT_IMAGES || new Set(imageIds).size !== imageIds.length) {
    throw new InvalidOperationError("El orden de imágenes no es válido.");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${productId}, 0))`);
    const current = await tx.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId));
    if (current.length !== imageIds.length || current.some((image) => !imageIds.includes(image.id))) {
      throw new InvalidOperationError("La lista no coincide con las imágenes actuales.");
    }
    await saveImageOrder(tx, productId, imageIds);
    await createAuditLog(tx, { action: "PRODUCT_IMAGE_REORDERED", entityType: "PRODUCT", entityId: productId, after: { imageIds } });
  });
}

export async function deleteProductImage(
  db: Database,
  storage: ImageStorage,
  imageId: string,
) {
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
  };
  await db
    .update(productImages)
    .set({ metadata: pendingMetadata, updatedAt: new Date() })
    .where(eq(productImages.id, image.id));

  await storage.deleteObject(image.storageKey);

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${image.productId}, 0))`);
    await tx.delete(productImages).where(eq(productImages.id, image.id));
    const remaining = await currentImages(tx, image.productId);
    await saveImageOrder(tx, image.productId, remaining.map(({ id }) => id));
    await createAuditLog(tx, { action: "PRODUCT_IMAGE_REMOVED", entityType: "PRODUCT_IMAGE", entityId: image.id, before: { productId: image.productId, objectKey: image.storageKey, isPrimary: image.isPrimary } });
  });
  return image.productId;
}
