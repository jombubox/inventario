import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/connection";
import { productImages, products } from "@/db/schema";
import { assertSafeImageDescription, MAX_PRODUCT_IMAGES } from "@/features/images/domain/image-policy";
import { EntityNotFoundError, InvalidOperationError } from "@/features/shared/domain/service-errors";
import { logServerError } from "@/lib/observability";
import type { DirectImageUploadInput } from "@/validators/image";
import { createProductImage } from "./image-service";
import type { DirectImageStorage } from "./r2";
import { IMAGE_UPLOAD_EXPIRATION_SECONDS, issueImageUploadToken, permanentImageToken, temporaryImageKey, verifyImageUploadToken } from "./upload-authorization";

async function existingImage(db: Database, input: DirectImageUploadInput) {
  const image = await db.query.productImages.findFirst({ where: eq(productImages.id, input.uploadId) });
  if (image && (image.productId !== input.productId || image.metadata?.fingerprint !== input.fingerprint || image.metadata?.mimeType !== input.mimeType)) {
    throw new InvalidOperationError("La selección de foto cambió. Selecciona el archivo de nuevo.");
  }
  return image;
}

export async function authorizeDirectImageUpload(db: Database, storage: DirectImageStorage, input: DirectImageUploadInput, secret: string) {
  assertSafeImageDescription(input);
  const product = await db.query.products.findFirst({ columns: { id: true }, where: and(eq(products.id, input.productId), isNull(products.deletedAt)) });
  if (!product) throw new EntityNotFoundError("El producto no existe.");
  const existing = await existingImage(db, input);
  if (existing) return { image: existing };
  const current = await db.query.productImages.findMany({ columns: { id: true }, where: eq(productImages.productId, input.productId) });
  if (current.length >= MAX_PRODUCT_IMAGES) throw new InvalidOperationError("El producto ya tiene el máximo de 10 imágenes.");
  const { token, claims } = issueImageUploadToken(input, secret);
  const uploadUrl = await storage.authorizePut(temporaryImageKey(input, secret), input.mimeType, IMAGE_UPLOAD_EXPIRATION_SECONDS);
  return { token, uploadUrl, expiresAt: claims.expiresAt, headers: { "Content-Type": input.mimeType } };
}

export async function confirmDirectImageUpload(db: Database, storage: DirectImageStorage, token: string, secret: string) {
  const input = verifyImageUploadToken(token, secret);
  const key = temporaryImageKey(input, secret);
  const existing = await existingImage(db, input);
  try {
    if (existing) return existing;
    const head = await storage.inspectTemporary(key);
    if (head.size !== input.size || head.contentType !== input.mimeType || !head.etag) {
      throw new InvalidOperationError("El tamaño o tipo de la foto subida no coincide. Reintenta la subida.");
    }
    const bytes = await storage.readTemporary(key, head.etag);
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
    const fingerprint = Buffer.from(digest).toString("hex");
    if (bytes.byteLength !== input.size || fingerprint !== input.fingerprint) {
      throw new InvalidOperationError("El contenido de la foto subida no coincide. Reintenta la subida.");
    }
    // Existing service validates the actual bytes and keeps its locked, retry-safe DB/order semantics.
    return await createProductImage(db, {
      putObject: async ({ objectKey }) => storage.copyTemporary(key, objectKey, head.etag),
      deleteObject: (objectKey) => storage.deleteObject(objectKey),
    }, { ...input, objectToken: permanentImageToken(input, secret), bytes });
  } catch (error) {
    // Another confirmation may have committed and removed the same temporary object.
    const registered = await existingImage(db, input);
    if (registered) return registered;
    throw error;
  } finally {
    // This prefix can never contain a registered final image. Expired/abandoned objects
    // are also covered by the deployment's prefix-scoped one-day lifecycle rule.
    try { await storage.deleteTemporary(key); }
    catch (error) { logServerError("r2_temporary_image_cleanup_failed", error, { productId: input.productId }); }
  }
}
