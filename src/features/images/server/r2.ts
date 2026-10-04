import "server-only";

import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { assertProductImageObjectKey } from "@/features/images/domain/image-policy";
import { R2ConfigurationError, R2StorageError } from "@/features/images/server/r2-errors";
import type { ServerEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env";
import { logServerError } from "@/lib/observability";
import { assertTemporaryImageKey } from "./upload-authorization";
import { MAX_IMAGE_BYTES } from "@/features/images/domain/image-policy";

export type R2PutObject = {
  objectKey: string;
  body: Uint8Array;
  contentType: string;
};

export interface ImageStorage {
  putObject(input: R2PutObject): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
}

export interface DirectImageStorage extends ImageStorage {
  authorizePut(objectKey: string, contentType: string, expiresIn: number): Promise<string>;
  inspectTemporary(objectKey: string): Promise<{ size: number; contentType: string; etag: string }>;
  readTemporary(objectKey: string, etag: string): Promise<Uint8Array>;
  copyTemporary(objectKey: string, finalKey: string, etag: string): Promise<void>;
  deleteTemporary(objectKey: string): Promise<void>;
}

function getR2StorageConfig(environment: ServerEnv) {
  const required = {
    CLOUDFLARE_ACCOUNT_ID: environment.CLOUDFLARE_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: environment.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: environment.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: environment.R2_BUCKET_NAME,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new R2ConfigurationError(`R2 no está configurado. Faltan: ${missing.join(", ")}.`);
  }

  const accountId = required.CLOUDFLARE_ACCOUNT_ID!;
  const localEndpoint = environment.APP_ENV !== "production" && /^https?:\/\//u.test(accountId);
  return {
    bucketName: required.R2_BUCKET_NAME!,
    endpoint: localEndpoint
      ? accountId.replace(/\/+$/u, "")
      : `https://${accountId}.r2.cloudflarestorage.com`,
    accessKeyId: required.R2_ACCESS_KEY_ID!,
    secretAccessKey: required.R2_SECRET_ACCESS_KEY!,
  };
}

export function createR2Storage(environment: ServerEnv = getServerEnv()): DirectImageStorage {
  const config = getR2StorageConfig(environment);
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async authorizePut(objectKey, contentType, expiresIn) {
      assertTemporaryImageKey(objectKey);
      return getSignedUrl(client, new PutObjectCommand({ Bucket: config.bucketName, Key: objectKey, ContentType: contentType }), {
        expiresIn, signableHeaders: new Set(["content-type"]),
      });
    },
    async inspectTemporary(objectKey) {
      assertTemporaryImageKey(objectKey);
      const head = await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: objectKey }));
      return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? "", etag: head.ETag ?? "" };
    },
    async readTemporary(objectKey, etag) {
      assertTemporaryImageKey(objectKey);
      const object = await client.send(new GetObjectCommand({ Bucket: config.bucketName, Key: objectKey, IfMatch: etag }));
      if (!object.Body || !object.ContentLength || object.ContentLength > MAX_IMAGE_BYTES) {
        (object.Body as { destroy?: () => void } | undefined)?.destroy?.();
        throw new R2StorageError("La imagen de R2 tiene un tamaño no válido.");
      }
      // Bounded server-side verification read, never a browser-to-application image body.
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > MAX_IMAGE_BYTES) throw new R2StorageError("La imagen supera 10 MB.");
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    },
    async copyTemporary(objectKey, finalKey, etag) {
      assertTemporaryImageKey(objectKey); assertProductImageObjectKey(finalKey);
      await client.send(new CopyObjectCommand({ Bucket: config.bucketName, Key: finalKey,
        CopySource: `${config.bucketName}/${objectKey}`, CopySourceIfMatch: etag }));
    },
    async deleteTemporary(objectKey) {
      assertTemporaryImageKey(objectKey);
      await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: objectKey }));
    },
    async putObject({ objectKey, body, contentType }) {
      assertProductImageObjectKey(objectKey);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucketName,
            Key: objectKey,
            Body: body,
            ContentType: contentType,
          }),
        );
      } catch (error) {
        logServerError("r2_image_upload_failed", error, { objectKey });
        throw new R2StorageError("R2 no pudo guardar la imagen. Intenta de nuevo.");
      }
    },

    async deleteObject(objectKey) {
      assertProductImageObjectKey(objectKey);
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucketName, Key: objectKey }),
        );
      } catch (error) {
        logServerError("r2_image_delete_failed", error, { objectKey });
        throw new R2StorageError("R2 no pudo eliminar la imagen. Intenta de nuevo.");
      }
    },
  };
}
