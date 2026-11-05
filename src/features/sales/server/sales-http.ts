import "server-only";
import { z } from "zod";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { UnauthorizedError } from "@/features/auth/domain/auth-errors";
import { EntityNotFoundError, InvalidOperationError } from "@/features/shared/domain/service-errors";
import { assertSameOriginMutation, InvalidRequestOriginError } from "@/lib/request-security";
import { salesValidationMessage } from "../domain/validation";

export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export async function salesHttp(request: Request, action: () => Promise<Response>) {
  try { await requireAdmin(request.headers); if (request.method !== "GET") assertSameOriginMutation(request); return await action(); }
  catch (e) {
    const status = e instanceof UnauthorizedError ? 401 : e instanceof InvalidRequestOriginError ? 403 : e instanceof z.ZodError ? 400 : e instanceof EntityNotFoundError ? 404 : e instanceof InvalidOperationError ? 409 : 500;
    const error = e instanceof z.ZodError ? salesValidationMessage(e) : status === 401 ? "Inicia sesión para continuar." : status === 403 ? "El origen de la solicitud no es válido." : status < 500 ? (e as Error).message : "No fue posible procesar la venta. Reintenta con la misma solicitud.";
    // Database errors can contain bound PII. Log only a fixed event and error class.
    if (status === 500) console.error(JSON.stringify({ event: "sales_request_failed", errorName: e instanceof Error ? e.name : "UnknownError" }));
    return Response.json({ error }, { status, headers: privateHeaders });
  }
}
export async function readSalesJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) throw new InvalidOperationError("Envía los datos de la venta como JSON.");
  const reader = request.body?.getReader(); if (!reader) throw new InvalidOperationError("Faltan los datos de la venta.");
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 65536) throw new InvalidOperationError("La solicitud excede 64 KB. Reduce el número de productos o notas."); chunks.push(value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (e) { if (e instanceof InvalidOperationError) throw e; throw new InvalidOperationError("Los datos de la venta no son válidos."); }
  finally { await reader.cancel(); reader.releaseLock(); }
}
