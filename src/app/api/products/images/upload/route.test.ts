import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES } from "@/features/images/domain/image-policy";
import { UnauthorizedError } from "@/features/auth/domain/auth-errors";
import { InvalidRequestOriginError } from "@/lib/request-security";

const { authorize, confirm, requireAdmin, sameOrigin } = vi.hoisted(() => ({ authorize: vi.fn(), confirm: vi.fn(), requireAdmin: vi.fn(), sameOrigin: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("@/features/auth/server/admin-auth", () => ({ requireAdmin }));
vi.mock("@/features/images/server/direct-upload-service", () => ({ authorizeDirectImageUpload: authorize, confirmDirectImageUpload: confirm }));
vi.mock("@/features/images/server/r2", () => ({ createR2Storage: () => ({}) }));
vi.mock("@/features/images/server/revalidation", () => ({ revalidateProductImages: vi.fn() }));
vi.mock("@/features/security/server/rate-limit", () => ({ consumeOperationalRateLimit: vi.fn() }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ R2_SECRET_ACCESS_KEY: "local-fixture" }) }));
vi.mock("@/lib/request-security", async (original) => ({ ...(await original<typeof import("@/lib/request-security")>()), assertSameOriginMutation: sameOrigin }));

const input = { productId: "10000000-0000-4000-8000-000000000001", uploadId: "10000000-0000-4000-8000-000000000002", batchId: "10000000-0000-4000-8000-000000000003",
  position: 0, filename: "photo.png", mimeType: "image/png", size: 6 * 1024 * 1024, signatureHex: "89504e470d0a1a0a00000000", fingerprint: "a".repeat(64) };
function request(value: unknown, path = "upload") {
  return new Request(`http://localhost/api/products/images/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
}
describe("direct image endpoints", () => {
  beforeEach(() => { vi.resetAllMocks(); authorize.mockResolvedValue({ token: "signed", uploadUrl: "https://r2.invalid/temporary" }); confirm.mockResolvedValue({ id: input.uploadId, productId: input.productId }); });
  it("authorizes a 6 MiB image using only a small JSON description", async () => {
    const { POST } = await import("./route"); const req = request(input);
    expect((await req.clone().text()).length).toBeLessThan(1024);
    const response = await POST(req); expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(authorize).toHaveBeenCalledWith(expect.anything(), expect.anything(), input, "local-fixture");
  });
  it.each([MAX_IMAGE_BYTES, 1])("allows the valid size %i", async (size) => {
    const { POST } = await import("./route"); expect((await POST(request({ ...input, size }))).status).toBe(200);
  });
  it.each([{ size: MAX_IMAGE_BYTES + 1 }, { size: 0 }, { mimeType: "image/svg+xml" }, { objectKey: "products/arbitrary/key.png" }, { position: 10 }])("rejects invalid description %j before signing", async (changes) => {
    const { POST } = await import("./route"); expect((await POST(request({ ...input, ...changes }))).status).toBe(400); expect(authorize).not.toHaveBeenCalled();
  });
  it("rejects the old multipart byte transport", async () => {
    const { POST } = await import("./route"); const body = new FormData(); body.set("file", new File(["bytes"], "photo.png"));
    expect((await POST(new Request("http://localhost/api/products/images/upload", { method: "POST", body }))).status).toBe(400);
    expect(authorize).not.toHaveBeenCalled();
  });
  it("bounds chunked JSON requests", async () => {
    const { POST } = await import("./route"); expect((await POST(request({ padding: "x".repeat(8193) }))).status).toBe(400); expect(authorize).not.toHaveBeenCalled();
  });
  it.each(["upload", "confirm"])("requires an authenticated admin for %s", async (path) => {
    requireAdmin.mockRejectedValue(new UnauthorizedError("Required"));
    const { POST } = path === "upload" ? await import("./route") : await import("../confirm/route");
    expect((await POST(request(path === "upload" ? input : { token: "token" }, path))).status).toBe(401);
    expect(authorize).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
  });
  it("rejects a cross-origin authorization", async () => {
    sameOrigin.mockImplementation(() => { throw new InvalidRequestOriginError("Rejected"); });
    const { POST } = await import("./route"); expect((await POST(request(input))).status).toBe(403); expect(authorize).not.toHaveBeenCalled();
  });
  it("confirms only a token and revalidates the product", async () => {
    const { POST } = await import("../confirm/route");
    expect((await POST(request({ token: "signed" }, "confirm"))).status).toBe(201);
    expect(confirm).toHaveBeenCalledWith(expect.anything(), expect.anything(), "signed", "local-fixture");
    expect((await POST(request({ token: "signed", productId: crypto.randomUUID(), objectKey: "arbitrary" }, "confirm"))).status).toBe(400);
  });
});
