import { getDb } from "@/db";
import { createAuditLog } from "@/features/audit/data/audit-log";
import { ENV_ADMIN_AUDIT_ENTITY_ID } from "@/features/auth/domain/env-admin-session";
import { requirePermissionFromHeaders } from "@/features/auth/server/authorization";
import { buildInventoryExport } from "@/features/exports/server/inventory-export";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";
import { ForbiddenError, UnauthorizedError } from "@/features/auth/domain/auth-errors";
import { InvalidOperationError, RateLimitExceededError } from "@/features/shared/domain/service-errors";
import { getRequestId, logServerError, logServerEvent, requestIdHeaders } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  let actorId: string | undefined;
  try {
    const actor = await requirePermissionFromHeaders(request.headers, "INVENTORY_EXPORT");
    actorId = actor.id;
    const db = getDb();
    await consumeOperationalRateLimit(db, {
      scope: "inventory-export",
      identity: actor.id,
      limit: 5,
      windowSeconds: 3_600,
    });
    const result = await buildInventoryExport(db);
    await createAuditLog(db, {
      userId: actor.id,
      action: "INVENTORY_EXPORTED",
      entityType: "USER",
      entityId: ENV_ADMIN_AUDIT_ENTITY_ID,
      metadata: { counts: result.counts, requestId },
    });
    logServerEvent("info", "inventory_export_completed", {
      requestId,
      userId: actor.id,
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
    if (error instanceof ForbiddenError) {
      return Response.json({ error: "No tienes permiso para exportar inventario.", code: "FORBIDDEN", requestId }, { status: 403, headers: requestIdHeaders(requestId) });
    }
    if (error instanceof RateLimitExceededError) {
      return Response.json({ error: error.message, code: "RATE_LIMITED", requestId }, { status: 429, headers: { ...requestIdHeaders(requestId), "Retry-After": String(error.retryAfterSeconds) } });
    }
    if (error instanceof InvalidOperationError) {
      return Response.json({ error: error.message, code: "EXPORT_LIMIT_EXCEEDED", requestId }, { status: 409, headers: requestIdHeaders(requestId) });
    }
    logServerError("inventory_export_failed", error, { requestId, userId: actorId });
    return Response.json({ error: "No fue posible exportar el inventario.", code: "EXPORT_FAILED", requestId }, { status: 500, headers: requestIdHeaders(requestId) });
  }
}
