type ApiErrorPayload = { error?: unknown };

function jsonContentType(contentType: string): boolean {
  return /(?:^|[+/])json(?:;|$)/iu.test(contentType);
}

function readablePlainText(value: string): string | null {
  const text = value.trim().replace(/\s+/gu, " ");
  if (!text || text.length > 300 || /<[^>]*>/u.test(text)) return null;
  return text;
}

export async function parseApiResponse<T>(
  response: Response,
  options: { fallbackError: string; payloadTooLargeError?: string },
): Promise<T> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const body = await response.text();
  let parsed: unknown;

  if (jsonContentType(contentType) && body) {
    try {
      parsed = JSON.parse(body);
    } catch {
      if (response.ok) {
        throw new Error("El servidor devolvió una respuesta inválida.");
      }
    }
  }

  if (response.ok) {
    if (parsed === undefined) {
      throw new Error("El servidor devolvió una respuesta inválida.");
    }
    return parsed as T;
  }

  if (response.status === 413 || /request entity too large|payload too large/iu.test(body)) {
    throw new Error(
      options.payloadTooLargeError ??
        "La solicitud es demasiado grande para el servidor.",
    );
  }

  if (parsed && typeof parsed === "object") {
    const error = (parsed as ApiErrorPayload).error;
    if (typeof error === "string" && error.trim()) throw new Error(error.trim());
  }

  if (response.status < 500 && contentType.startsWith("text/plain")) {
    const message = readablePlainText(body);
    if (message) throw new Error(message);
  }

  throw new Error(options.fallbackError);
}
