import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { confirmDirectImageUpload } from "@/features/images/server/direct-upload-service";
import { imageErrorResponse } from "@/features/images/server/image-http";
import { readImageJson } from "@/features/images/server/image-json-request";
import { createR2Storage } from "@/features/images/server/r2";
import { revalidateProductImages } from "@/features/images/server/revalidation";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";
import { getServerEnv } from "@/lib/env";
import { getRequestId, requestIdHeaders } from "@/lib/observability";
import { assertSameOriginMutation } from "@/lib/request-security";
import { directImageConfirmationSchema } from "@/validators/image";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    assertSameOriginMutation(request);
    await requireAdmin(request.headers);
    const { token } = directImageConfirmationSchema.parse(await readImageJson(request));
    const db = getDb();
    await consumeOperationalRateLimit(db, { scope: "image-confirm", identity: "admin", limit: 60, windowSeconds: 600 });
    const env = getServerEnv();
    const image = await confirmDirectImageUpload(db, createR2Storage(env), token, env.R2_SECRET_ACCESS_KEY!);
    revalidateProductImages(image.productId);
    return NextResponse.json({ image }, { status: 201, headers: { ...requestIdHeaders(requestId), "Cache-Control": "private, no-store" } });
  } catch (error) {
    return imageErrorResponse(error, { requestId, event: "image_upload_confirmation_failed" });
  }
}
