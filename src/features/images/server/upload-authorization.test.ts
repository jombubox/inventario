import { describe, expect, it } from "vitest";
import { assertTemporaryImageKey, issueImageUploadToken, permanentImageToken, temporaryImageKey, verifyImageUploadToken } from "./upload-authorization";
import { directImageUploadSchema } from "@/validators/image";

const input = directImageUploadSchema.parse({ productId: crypto.randomUUID(), uploadId: crypto.randomUUID(), batchId: crypto.randomUUID(), position: 0,
  filename: "photo.png", mimeType: "image/png", size: 12, signatureHex: "89504e470d0a1a0a00000000", fingerprint: "a".repeat(64) });
describe("image upload capability", () => {
  it("binds product, selection, bytes, ordering and expiry", () => {
    const { token } = issueImageUploadToken(input, "test-secret", 1000);
    expect(verifyImageUploadToken(token, "test-secret", 2000)).toMatchObject(input);
    expect(() => verifyImageUploadToken(token, "test-secret", 301000)).toThrow(/venció/);
    expect(() => verifyImageUploadToken(token, "other-secret", 2000)).toThrow();
    const [payload, signature] = token.split(".");
    const changed = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), productId: crypto.randomUUID() })).toString("base64url");
    expect(() => verifyImageUploadToken(`${changed}.${signature}`, "test-secret", 2000)).toThrow();
  });
  it("uses a stable temporary key and never authorizes a final key", () => {
    const key = temporaryImageKey(input, "test-secret"); expect(() => assertTemporaryImageKey(key)).not.toThrow();
    expect(key).toBe(temporaryImageKey(input, "test-secret"));
    expect(temporaryImageKey({ ...input, fingerprint: "b".repeat(64) }, "test-secret")).not.toBe(key);
    expect(temporaryImageKey({ ...input, productId: crypto.randomUUID() }, "test-secret")).not.toBe(key);
    expect(() => assertTemporaryImageKey(`products/SKU/${input.uploadId}.png`)).toThrow();
    expect(() => assertTemporaryImageKey("product-image-uploads/../../other.png")).toThrow();
    expect(permanentImageToken(input, "test-secret")).not.toBe(input.uploadId);
    expect(permanentImageToken(input, "test-secret")).toBe(permanentImageToken(input, "test-secret"));
    expect(permanentImageToken(input, "other-secret")).not.toBe(permanentImageToken(input, "test-secret"));
  });
});
