import "server-only";

import { assertProductImageObjectKey } from "@/features/images/domain/image-policy";
import { R2ConfigurationError } from "@/features/images/server/r2-errors";

export function getR2PublicUrl(
  objectKey: string,
  publicBaseUrl: string | undefined = process.env.R2_PUBLIC_URL,
): string {
  assertProductImageObjectKey(objectKey);
  if (!publicBaseUrl) {
    throw new R2ConfigurationError("R2 no está configurado. Falta: R2_PUBLIC_URL.");
  }

  const base = new URL(publicBaseUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new R2ConfigurationError("R2_PUBLIC_URL debe ser un origen HTTP(S) público sin credenciales, query ni hash.");
  }

  return `${base.href.replace(/\/+$/u, "")}/${objectKey}`;
}
