import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { requirePermissionFromHeaders } from "@/features/auth/server/authorization";
import { revalidatePublicCatalog } from "@/features/catalog/server/revalidation";
import { imageErrorResponse } from "@/features/images/server/image-http";
import { reorderProductImages } from "@/features/images/server/image-service";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";
import { getRequestId, requestIdHeaders } from "@/lib/observability";
import { assertSameOriginMutation } from "@/lib/request-security";
import { imageReorderRequestSchema } from "@/validators/image";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  let userId: string | undefined;
  try {
    assertSameOriginMutation(request);
    const actor = await requirePermissionFromHeaders(request.headers, "IMAGE_MANAGE");
    userId = actor.id;
    const db = getDb();
    await consumeOperationalRateLimit(db, { scope: "image-mutation", identity: actor.id, limit: 60, windowSeconds: 600 });
    const input = imageReorderRequestSchema.parse(await request.json());
    await reorderProductImages(db, actor, input.productId, input.imageIds);
    revalidatePublicCatalog();
    return NextResponse.json({ ok: true }, { headers: requestIdHeaders(requestId) });
  } catch (error) {
    return imageErrorResponse(error, { requestId, event: "image_reorder_failed", userId });
  }
}
