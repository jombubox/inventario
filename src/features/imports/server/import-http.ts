import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ForbiddenError, UnauthorizedError } from "@/features/auth/domain/auth-errors";
import { MAX_XLSX_BYTES } from "@/features/imports/domain/xlsx-security";
import {
  FeatureDisabledError,
  InvalidOperationError,
  RateLimitExceededError,
} from "@/features/shared/domain/service-errors";
import { logServerError, requestIdHeaders } from "@/lib/observability";

type ImportErrorContext = {
  requestId: string;
  event: string;
  userId?: string;
};

export function importErrorResponse(error: unknown, context: ImportErrorContext) {
  const headers = requestIdHeaders(context.requestId);
  if (error instanceof UnauthorizedError) {
    return NextResponse.json(
      { error: "Inicia sesión para continuar.", code: "AUTH_REQUIRED", requestId: context.requestId },
      { status: 401, headers },
    );
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json(
      { error: "No tienes permiso para realizar esta acción.", code: "FORBIDDEN", requestId: context.requestId },
      { status: 403, headers },
    );
  }
  if (error instanceof FeatureDisabledError) {
    return NextResponse.json(
      { error: error.message, code: "FEATURE_DISABLED", requestId: context.requestId },
      { status: 503, headers },
    );
  }
  if (error instanceof RateLimitExceededError) {
    return NextResponse.json(
      { error: error.message, code: "RATE_LIMITED", requestId: context.requestId },
      { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfterSeconds) } },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Los datos de la solicitud no son válidos.", code: "INVALID_REQUEST", issues: error.issues, requestId: context.requestId },
      { status: 400, headers },
    );
  }
  if (error instanceof InvalidOperationError) {
    return NextResponse.json(
      { error: error.message, code: "INVALID_OPERATION", requestId: context.requestId },
      { status: 409, headers },
    );
  }
  if (error instanceof Error && /XLSX|archivo|hoja|columna|fila|encabezado|ZIP|solicitud|importación|JSON/iu.test(error.message)) {
    return NextResponse.json(
      { error: error.message, code: "INVALID_IMPORT", requestId: context.requestId },
      { status: 400, headers },
    );
  }
  logServerError(context.event, error, context);
  return NextResponse.json(
    { error: "No fue posible procesar la importación.", code: "IMPORT_FAILED", requestId: context.requestId },
    { status: 500, headers },
  );
}

export async function readImportMultipart(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_XLSX_BYTES + 1024 * 1024) {
    throw new Error("La solicitud de importación supera el límite permitido.");
  }
  const formData = await request.formData();
  const file = formData.get("file");
  const options = formData.get("options");
  if (!(file instanceof File)) throw new Error("Debes adjuntar un archivo XLSX.");
  if (typeof options !== "string") throw new Error("Faltan las opciones de importación.");
  let parsedOptions: unknown;
  try {
    parsedOptions = JSON.parse(options);
  } catch {
    throw new Error("Las opciones de importación no contienen JSON válido.");
  }
  return { file, parsedOptions };
}
