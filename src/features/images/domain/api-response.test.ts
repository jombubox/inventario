import { describe, expect, it } from "vitest";

import { parseApiResponse } from "@/features/images/domain/api-response";

const options = {
  fallbackError: "No fue posible subir la imagen.",
  payloadTooLargeError: "La imagen supera 10 MB.",
};

describe("image API response parsing", () => {
  it("parses successful JSON responses", async () => {
    const response = new Response(JSON.stringify({ image: { id: "image-1" } }), {
      status: 201,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

    await expect(parseApiResponse(response, options)).resolves.toEqual({
      image: { id: "image-1" },
    });
  });

  it("surfaces JSON API errors", async () => {
    const response = new Response(JSON.stringify({ error: "Archivo inválido." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    await expect(parseApiResponse(response, options)).rejects.toThrow("Archivo inválido.");
  });

  it("handles plain-text server and proxy errors without exposing their body", async () => {
    const response = new Response("Servicio temporalmente no disponible.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

    await expect(parseApiResponse(response, options)).rejects.toThrow(options.fallbackError);
  });

  it("does not expose HTML error pages", async () => {
    const response = new Response("<html><body>Internal details</body></html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });

    await expect(parseApiResponse(response, options)).rejects.toThrow(options.fallbackError);
  });

  it("turns a non-JSON 413 into a useful upload limit error", async () => {
    const response = new Response("Request Entity Too Large", {
      status: 413,
      headers: { "Content-Type": "text/plain" },
    });

    await expect(parseApiResponse(response, options)).rejects.toThrow(
      options.payloadTooLargeError,
    );
  });

  it("uses the safe fallback for malformed JSON and an incorrect content type", async () => {
    const malformedJson = new Response("{not-json", {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
    const mislabeledHtml = new Response("<h1>Internal proxy details</h1>", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });

    await expect(parseApiResponse(malformedJson, options)).rejects.toThrow(
      options.fallbackError,
    );
    await expect(parseApiResponse(mislabeledHtml, options)).rejects.toThrow(
      options.fallbackError,
    );
  });

  it("uses the safe fallback when the content type is missing", async () => {
    const response = new Response("Upstream service failed", { status: 500 });

    await expect(parseApiResponse(response, options)).rejects.toThrow(
      options.fallbackError,
    );
  });
});
