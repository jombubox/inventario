import { InvalidOperationError } from "@/features/shared/domain/service-errors";

export async function readImageJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "")) {
    throw new InvalidOperationError("Envía solo los datos de autorización de la imagen.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidOperationError("Faltan los datos de la imagen.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) throw new InvalidOperationError("Los datos de autorización de la imagen son demasiado grandes.");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof InvalidOperationError) throw error;
    throw new InvalidOperationError("Los datos de autorización de la imagen no son válidos.");
  } finally { await reader.cancel(); reader.releaseLock(); }
}
