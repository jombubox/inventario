import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { UnauthorizedError } from "@/features/auth/domain/auth-errors";
import { R2ConfigurationError, R2StorageError } from "@/features/images/server/r2-errors";
import {
  EntityNotFoundError,
  InvalidOperationError,
  RateLimitExceededError,
} from "@/features/shared/domain/service-errors";
import { logServerError, requestIdHeaders } from "@/lib/observability";
import { InvalidRequestOriginError } from "@/lib/request-security";

type ImageErrorContext = { requestId: string; event: string };

export function imageErrorResponse(error: unknown, context: ImageErrorContext) {
  const headers = requestIdHeaders(context.requestId);
  if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Inicia sesión para continuar.", code: "AUTH_REQUIRED", requestId: context.requestId }, { status: 401, headers });
  if (error instanceof InvalidRequestOriginError) return NextResponse.json({ error: "La solicitud proviene de un origen no permitido.", code: "INVALID_REQUEST_ORIGIN", requestId: context.requestId }, { status: 403, headers });
  if (error instanceof EntityNotFoundError) return NextResponse.json({ error: error.message, code: "NOT_FOUND", requestId: context.requestId }, { status: 404, headers });
  if (error instanceof RateLimitExceededError) {
    return NextResponse.json(
      { error: error.message, code: "RATE_LIMITED", requestId: context.requestId },
      { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfterSeconds) } },
    );
  }
  if (error instanceof InvalidOperationError || error instanceof ZodError) {
    return NextResponse.json(
      { error: error instanceof ZodError ? "Los datos de la imagen no son válidos." : error.message, code: "INVALID_IMAGE", requestId: context.requestId },
      { status: 400, headers },
    );
  }
  if (error instanceof R2ConfigurationError) {
    logServerError(context.event, error, context);
    return NextResponse.json({ error: error.message, code: "R2_NOT_CONFIGURED", requestId: context.requestId }, { status: 503, headers });
  }
  if (error instanceof R2StorageError) {
    return NextResponse.json({ error: error.message, code: "IMAGE_STORAGE_ERROR", requestId: context.requestId }, { status: 502, headers });
  }
  if (error instanceof Error && /imagen|archivo|firma|extensión|SKU|clave/iu.test(error.message)) {
    return NextResponse.json({ error: error.message, code: "INVALID_IMAGE", requestId: context.requestId }, { status: 400, headers });
  }
  logServerError(context.event, error, context);
  return NextResponse.json(
    { error: "No fue posible completar la operación de imagen.", code: "IMAGE_FAILED", requestId: context.requestId },
    { status: 500, headers },
  );
}
