import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_REQUEST_BYTES,
} from "@/features/images/domain/image-policy";
import { imageErrorResponse } from "@/features/images/server/image-http";
import { createProductImage } from "@/features/images/server/image-service";
import { createR2Storage } from "@/features/images/server/r2";
import { revalidatePublicCatalog } from "@/features/catalog/server/revalidation";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";
import { InvalidOperationError } from "@/features/shared/domain/service-errors";
import { getRequestId, requestIdHeaders } from "@/lib/observability";
import { assertSameOriginMutation } from "@/lib/request-security";
import { imageUploadRequestSchema } from "@/validators/image";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    assertSameOriginMutation(request);
    await requireAdmin(request.headers);
    const db = getDb();
    await consumeOperationalRateLimit(db, {
      scope: "image-upload",
      identity: "admin",
      limit: 30,
      windowSeconds: 600,
    });

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_REQUEST_BYTES) {
      return NextResponse.json(
        { error: "Cada imagen debe pesar como máximo 10 MB.", code: "IMAGE_TOO_LARGE", requestId },
        { status: 413, headers: requestIdHeaders(requestId) },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new InvalidOperationError("Selecciona un archivo de imagen.");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Cada imagen debe pesar como máximo 10 MB.", code: "IMAGE_TOO_LARGE", requestId },
        { status: 413, headers: requestIdHeaders(requestId) },
      );
    }
    const input = imageUploadRequestSchema.parse({
      productId: form.get("productId"),
      alt: form.get("alt") || undefined,
    });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = await createProductImage(db, createR2Storage(), {
      ...input,
      filename: file.name,
      mimeType: file.type,
      bytes,
    });
    revalidatePublicCatalog();
    revalidatePath("/admin/productos");
    revalidatePath(`/admin/productos/${input.productId}`);
    return NextResponse.json({ image }, { status: 201, headers: requestIdHeaders(requestId) });
  } catch (error) {
    return imageErrorResponse(error, { requestId, event: "image_upload_failed" });
  }
}
