import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertProductImageObjectKey,
  assertSafeImageDescription,
  createProductImageObjectKey,
} from "@/features/images/domain/image-policy";
import { getR2PublicUrl } from "@/features/images/server/r2-public-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("image upload policy", () => {
  it("accepts matching JPEG, PNG and WEBP declarations", () => {
    expect(() => assertSafeImageDescription({ filename: "foto.jpg", mimeType: "image/jpeg", size: 100, signatureHex: "ffd8ffe00000000000000000" })).not.toThrow();
    expect(() => assertSafeImageDescription({ filename: "foto.png", mimeType: "image/png", size: 100, signatureHex: "89504e470d0a1a0a00000000" })).not.toThrow();
    expect(() => assertSafeImageDescription({ filename: "foto.webp", mimeType: "image/webp", size: 100, signatureHex: "524946460000000057454250" })).not.toThrow();
  });

  it("rejects mismatched signatures, extensions and oversized files", () => {
    expect(() => assertSafeImageDescription({ filename: "foto.jpg", mimeType: "image/jpeg", size: 100, signatureHex: "89504e470d0a1a0a00000000" })).toThrow(/firma/u);
    expect(() => assertSafeImageDescription({ filename: "foto.png", mimeType: "image/jpeg", size: 100, signatureHex: "ffd8ffe00000000000000000" })).toThrow(/extensión/u);
    expect(() => assertSafeImageDescription({ filename: "foto.jpg", mimeType: "image/jpeg", size: 11 * 1024 * 1024, signatureHex: "ffd8ffe00000000000000000" })).toThrow(/10 MB/u);
  });

  it("creates safe, unique R2 object keys and public URLs", () => {
    const first = createProductImageObjectKey("JBX-CHAIR-000123", "image/webp");
    const second = createProductImageObjectKey("JBX-CHAIR-000123", "image/webp");
    expect(first).toMatch(/^products\/JBX-CHAIR-000123\/[0-9a-f-]{36}\.webp$/u);
    expect(second).not.toBe(first);
    expect(() => assertProductImageObjectKey(first)).not.toThrow();
    expect(() => assertProductImageObjectKey("products/../secret.jpg")).toThrow(/clave/u);
    expect(getR2PublicUrl(first, "https://images.example.com/")).toBe(
      `https://images.example.com/${first}`,
    );
  });

  it("reads only its own runtime binding when building a public image URL", () => {
    vi.stubEnv("R2_PUBLIC_URL", "https://images.example.com");
    vi.stubEnv("ADMIN_EMAIL", "");
    vi.stubEnv("ADMIN_PASSWORD", "");
    vi.stubEnv("AUTH_SECRET", "");

    const objectKey = createProductImageObjectKey("JBX-CHAIR-000123", "image/webp");
    expect(getR2PublicUrl(objectKey)).toBe(`https://images.example.com/${objectKey}`);
  });
});
