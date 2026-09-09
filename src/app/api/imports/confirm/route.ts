import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { revalidatePublicCatalog } from "@/features/catalog/server/revalidation";
import { importErrorResponse, readImportMultipart } from "@/features/imports/server/import-http";
import { confirmImportFile } from "@/features/imports/server/import-service";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";
import { FeatureDisabledError } from "@/features/shared/domain/service-errors";
import { getServerEnv } from "@/lib/env";
import { getRequestId, logServerEvent, requestIdHeaders } from "@/lib/observability";
import { assertSameOriginMutation } from "@/lib/request-security";
import { confirmImportOptionsSchema } from "@/validators/import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    assertSameOriginMutation(request);
    await requireAdmin(request.headers);
    if (!getServerEnv().ENABLE_IMPORTS) {
      throw new FeatureDisabledError("Las importaciones están deshabilitadas temporalmente.");
    }
    const db = getDb();
    await consumeOperationalRateLimit(db, { scope: "import-confirm", identity: "admin", limit: 5, windowSeconds: 3_600 });
    const { file, parsedOptions } = await readImportMultipart(request);
    const options = confirmImportOptionsSchema.parse(parsedOptions);
    const result = await confirmImportFile(db, { file, ...options });
    revalidatePublicCatalog();
    logServerEvent("info", "import_confirmed", { requestId });
    return NextResponse.json(result, { headers: requestIdHeaders(requestId) });
  } catch (error) {
    return importErrorResponse(error, { requestId, event: "import_confirm_failed" });
  }
}
