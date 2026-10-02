import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_REQUEST_BYTES,
} from "@/features/images/domain/image-policy";
import { InvalidOperationError } from "@/features/shared/domain/service-errors";

const createProductImage = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("@/features/auth/server/admin-auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/features/catalog/server/revalidation", () => ({
  revalidatePublicCatalog: vi.fn(),
}));
vi.mock("@/features/images/server/image-service", () => ({
  createProductImage,
}));
vi.mock("@/features/images/server/r2", () => ({ createR2Storage: () => ({}) }));
vi.mock("@/features/security/server/rate-limit", () => ({
  consumeOperationalRateLimit: vi.fn(),
}));
vi.mock("@/lib/request-security", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-security")>()),
  assertSameOriginMutation: vi.fn(),
}));

describe("product image upload route", () => {
  beforeEach(() => {
    createProductImage.mockReset();
  });

  it("returns a JSON 413 before reading an oversized multipart request", async () => {
    const { POST } = await import("@/app/api/products/images/upload/route");
    const request = new Request("http://localhost/api/products/images/upload", {
      method: "POST",
      headers: { "Content-Length": String(MAX_IMAGE_REQUEST_BYTES + 1) },
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      code: "IMAGE_TOO_LARGE",
      error: "Cada imagen debe pesar como máximo 10 MB.",
    });
    expect(createProductImage).not.toHaveBeenCalled();
  });

  it("returns a JSON 413 when the file exceeds the application limit", async () => {
    const { POST } = await import("@/app/api/products/images/upload/route");
    const bytes = new Uint8Array(MAX_IMAGE_BYTES + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const body = new FormData();
    body.set("productId", "10000000-0000-4000-8000-000000000001");
    body.set("file", new File([bytes], "too-large.png", { type: "image/png" }));

    const response = await POST(new Request("http://localhost/api/products/images/upload", {
      method: "POST",
      body,
    }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "IMAGE_TOO_LARGE" });
    expect(createProductImage).not.toHaveBeenCalled();
  });

  it("accepts a valid multipart request and serializes the result as JSON", async () => {
    createProductImage.mockResolvedValue({ id: "image-1" });
    const { POST } = await import("@/app/api/products/images/upload/route");
    const body = new FormData();
    body.set("productId", "10000000-0000-4000-8000-000000000001");
    body.set(
      "file",
      new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], "image.png", {
        type: "image/png",
      }),
    );
    const request = new Request("http://localhost/api/products/images/upload", {
      method: "POST",
      body,
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ image: { id: "image-1" } });
    expect(createProductImage).toHaveBeenCalledOnce();
  });

  it("rejects a multipart request without a file", async () => {
    const { POST } = await import("@/app/api/products/images/upload/route");
    const body = new FormData();
    body.set("productId", "10000000-0000-4000-8000-000000000001");

    const response = await POST(new Request("http://localhost/api/products/images/upload", {
      method: "POST",
      body,
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_IMAGE" });
    expect(createProductImage).not.toHaveBeenCalled();
  });

  it("serializes unsupported image errors as JSON", async () => {
    createProductImage.mockRejectedValue(
      new InvalidOperationError("Solo se permiten imágenes JPEG, PNG o WEBP."),
    );
    const { POST } = await import("@/app/api/products/images/upload/route");
    const body = new FormData();
    body.set("productId", "10000000-0000-4000-8000-000000000001");
    body.set("file", new File(["not an image"], "invalid.txt", { type: "text/plain" }));

    const response = await POST(new Request("http://localhost/api/products/images/upload", {
      method: "POST",
      body,
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_IMAGE" });
  });

  it("parses a valid image at the 10 MiB application limit", async () => {
    createProductImage.mockResolvedValue({ id: "large-image" });
    const { POST } = await import("@/app/api/products/images/upload/route");
    const bytes = new Uint8Array(MAX_IMAGE_BYTES);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const body = new FormData();
    body.set("productId", "10000000-0000-4000-8000-000000000001");
    body.set("file", new File([bytes], "large.png", { type: "image/png" }));

    const response = await POST(new Request("http://localhost/api/products/images/upload", {
      method: "POST",
      body,
    }));

    expect(response.status).toBe(201);
    expect(createProductImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ bytes: expect.objectContaining({ byteLength: MAX_IMAGE_BYTES }) }),
    );
  });
});
