import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { requirePermissionFromHeaders } from "@/features/auth/server/authorization";
import { MAX_IMAGE_BYTES } from "@/features/images/domain/image-policy";
import { imageErrorResponse } from "@/features/images/server/image-http";
import { createProductImage } from "@/features/images/server/image-service";
import { createR2Storage } from "@/features/images/server/r2";
import { revalidatePublicCatalog } from "@/features/catalog/server/revalidation";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";
import { InvalidOperationError } from "@/features/shared/domain/service-errors";
import { getRequestId, requestIdHeaders } from "@/lib/observability";
import { assertSameOriginMutation } from "@/lib/request-security";
import { imageUploadRequestSchema } from "@/validators/image";

const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  let userId: string | undefined;
  try {
    assertSameOriginMutation(request);
    const actor = await requirePermissionFromHeaders(request.headers, "IMAGE_MANAGE");
    userId = actor.id;
    const db = getDb();
    await consumeOperationalRateLimit(db, {
      scope: "image-upload",
      identity: actor.id,
      limit: 30,
      windowSeconds: 600,
    });

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
      throw new InvalidOperationError("Cada imagen debe pesar como máximo 10 MB.");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new InvalidOperationError("Selecciona un archivo de imagen.");
    }
    const input = imageUploadRequestSchema.parse({
      productId: form.get("productId"),
      alt: form.get("alt") || undefined,
    });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = await createProductImage(db, actor, createR2Storage(), {
      ...input,
      filename: file.name,
      mimeType: file.type,
      bytes,
    });
    revalidatePublicCatalog();
    return NextResponse.json({ image }, { status: 201, headers: requestIdHeaders(requestId) });
  } catch (error) {
    return imageErrorResponse(error, { requestId, event: "image_upload_failed", userId });
  }
}
