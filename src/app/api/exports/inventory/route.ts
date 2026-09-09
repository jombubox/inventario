import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { buildInventoryExport } from "@/features/exports/server/inventory-export";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";
import { UnauthorizedError } from "@/features/auth/domain/auth-errors";
import { InvalidOperationError, RateLimitExceededError } from "@/features/shared/domain/service-errors";
import { getRequestId, logServerError, logServerEvent, requestIdHeaders } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    await requireAdmin(request.headers);
    const db = getDb();
    await consumeOperationalRateLimit(db, {
      scope: "inventory-export",
      identity: "admin",
      limit: 5,
      windowSeconds: 3_600,
    });
    const result = await buildInventoryExport(db);
    logServerEvent("info", "inventory_export_completed", {
      requestId,
      ...result.counts,
    });
    return new Response(result.bytes, {
      headers: {
        ...requestIdHeaders(requestId),
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Inicia sesión para continuar.", code: "AUTH_REQUIRED", requestId }, { status: 401, headers: requestIdHeaders(requestId) });
    }
    if (error instanceof RateLimitExceededError) {
      return Response.json({ error: error.message, code: "RATE_LIMITED", requestId }, { status: 429, headers: { ...requestIdHeaders(requestId), "Retry-After": String(error.retryAfterSeconds) } });
    }
    if (error instanceof InvalidOperationError) {
      return Response.json({ error: error.message, code: "EXPORT_LIMIT_EXCEEDED", requestId }, { status: 409, headers: requestIdHeaders(requestId) });
    }
    logServerError("inventory_export_failed", error, { requestId });
    return Response.json({ error: "No fue posible exportar el inventario.", code: "EXPORT_FAILED", requestId }, { status: 500, headers: requestIdHeaders(requestId) });
  }
}
