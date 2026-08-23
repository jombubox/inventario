import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { requirePermissionFromHeaders } from "@/features/auth/server/authorization";
import { importErrorResponse, readImportMultipart } from "@/features/imports/server/import-http";
import { analyzeImportFile } from "@/features/imports/server/import-service";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";
import { FeatureDisabledError } from "@/features/shared/domain/service-errors";
import { getServerEnv } from "@/lib/env";
import { getRequestId, requestIdHeaders } from "@/lib/observability";
import { assertSameOriginMutation } from "@/lib/request-security";
import { analyzeImportOptionsSchema } from "@/validators/import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  let userId: string | undefined;
  try {
    assertSameOriginMutation(request);
    const actor = await requirePermissionFromHeaders(request.headers, "IMPORT_EXECUTE");
    userId = actor.id;
    if (!getServerEnv().ENABLE_IMPORTS) {
      throw new FeatureDisabledError("Las importaciones están deshabilitadas temporalmente.");
    }
    const db = getDb();
    await consumeOperationalRateLimit(db, { scope: "import-analyze", identity: actor.id, limit: 10, windowSeconds: 600 });
    const { file, parsedOptions } = await readImportMultipart(request);
    const options = analyzeImportOptionsSchema.parse(parsedOptions);
    const preview = await analyzeImportFile(db, actor, { file, ...options });
    return NextResponse.json(preview, { headers: requestIdHeaders(requestId) });
  } catch (error) {
    return importErrorResponse(error, { requestId, event: "import_analyze_failed", userId });
  }
}
