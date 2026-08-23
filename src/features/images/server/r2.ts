import "server-only";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { assertProductImageObjectKey } from "@/features/images/domain/image-policy";
import { R2ConfigurationError, R2StorageError } from "@/features/images/server/r2-errors";
import type { ServerEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env";
import { logServerError } from "@/lib/observability";

export type R2PutObject = {
  objectKey: string;
  body: Uint8Array;
  contentType: string;
};

export interface ImageStorage {
  putObject(input: R2PutObject): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
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

export function createR2Storage(environment: ServerEnv = getServerEnv()): ImageStorage {
  const config = getR2StorageConfig(environment);
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
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
