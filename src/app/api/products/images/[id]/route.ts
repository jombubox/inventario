import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { revalidatePublicCatalog } from "@/features/catalog/server/revalidation";
import { imageErrorResponse } from "@/features/images/server/image-http";
import { deleteProductImage, updateProductImage } from "@/features/images/server/image-service";
import { createR2Storage } from "@/features/images/server/r2";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";
import { getRequestId, requestIdHeaders } from "@/lib/observability";
import { assertSameOriginMutation } from "@/lib/request-security";
import { imageUpdateRequestSchema } from "@/validators/image";

type RouteContext = { params: Promise<{ id: string }> };

async function authorizeMutation(request: Request) {
  assertSameOriginMutation(request);
  await requireAdmin(request.headers);
  const db = getDb();
  await consumeOperationalRateLimit(db, { scope: "image-mutation", identity: "admin", limit: 60, windowSeconds: 600 });
  return db;
}

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const db = await authorizeMutation(request);
    const { id } = await context.params;
    const input = imageUpdateRequestSchema.parse(await request.json());
    await updateProductImage(db, { imageId: id, ...input });
    revalidatePublicCatalog();
    return NextResponse.json({ ok: true }, { headers: requestIdHeaders(requestId) });
  } catch (error) {
    return imageErrorResponse(error, { requestId, event: "image_update_failed" });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);
  try {
    const db = await authorizeMutation(request);
    const { id } = await context.params;
    await deleteProductImage(db, createR2Storage(), id);
    revalidatePublicCatalog();
    return NextResponse.json({ ok: true }, { headers: requestIdHeaders(requestId) });
  } catch (error) {
    return imageErrorResponse(error, { requestId, event: "image_delete_failed" });
  }
}
