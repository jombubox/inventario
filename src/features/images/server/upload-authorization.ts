import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { directImageUploadSchema, type DirectImageUploadInput } from "@/validators/image";
import { InvalidOperationError } from "@/features/shared/domain/service-errors";

export const IMAGE_UPLOAD_EXPIRATION_SECONDS = 300;
export const TEMPORARY_IMAGE_PREFIX = "product-image-uploads/";
const claimsSchema = directImageUploadSchema.extend({ expiresAt: z.number().int().positive() }).strict();
export type ImageUploadClaims = z.infer<typeof claimsSchema>;

function signature(value: string, secret: string) {
  return createHmac("sha256", secret).update(`jumbobox-image-upload-v1:${value}`).digest();
}

export function issueImageUploadToken(input: DirectImageUploadInput, secret: string, now = Date.now()) {
  const claims = claimsSchema.parse({ ...input, expiresAt: Math.floor(now / 1000) + IMAGE_UPLOAD_EXPIRATION_SECONDS });
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: `${payload}.${signature(payload, secret).toString("base64url")}`, claims };
}

export function verifyImageUploadToken(token: string, secret: string, now = Date.now()): ImageUploadClaims {
  try {
    const [payload, digest, extra] = token.split(".");
    if (!payload || !digest || extra || token.length > 4096) throw new Error();
    const actual = Buffer.from(digest, "base64url"), expected = signature(payload, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (claims.expiresAt <= Math.floor(now / 1000)) throw new Error();
    return claims;
  } catch {
    throw new InvalidOperationError("La autorización de la foto venció o no es válida. Reintenta la subida.");
  }
}

// Deterministic per selection/content, but derived on the server. Never a final image key.
export function temporaryImageKey(input: DirectImageUploadInput, secret: string) {
  const digest = signature(`${input.productId}:${input.uploadId}:${input.fingerprint}`, secret).toString("hex");
  const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[input.mimeType];
  return `${TEMPORARY_IMAGE_PREFIX}${input.productId}/${input.uploadId}-${digest}.${extension}`;
}

export function permanentImageToken(input: DirectImageUploadInput, secret: string) {
  const bytes = signature(`final:${input.productId}:${input.uploadId}:${input.fingerprint}`, secret).subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function assertTemporaryImageKey(key: string) {
  if (!/^product-image-uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}-[0-9a-f]{64}\.(png|jpg|webp)$/u.test(key)) {
    throw new InvalidOperationError("La clave temporal de la imagen no es válida.");
  }
}
