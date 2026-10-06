import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), resolve: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("@/features/auth/server/admin-auth", () => ({ requireAdmin: mocks.authenticate }));
vi.mock("@/features/products/server/compatible-model-service", () => ({ resolveCompatibleModel: mocks.resolve }));
import { addCompatibleModelInlineAction } from "./compatible-model-actions";

describe("inline compatible model action", () => {
  beforeEach(() => { mocks.authenticate.mockReset(); mocks.resolve.mockReset(); });
  it("authenticates and selects the canonical server match without persisting a standalone model", async () => {
    const body = new FormData();
    body.set("brandId", "00000000-0000-4000-8000-000000000001");
    body.set("model", "  75h78g  ");
    const compatibility = { brandId: body.get("brandId"), model: "75H78G", notes: null };
    mocks.resolve.mockResolvedValue({ compatibility, reused: true });
    expect(await addCompatibleModelInlineAction(body)).toMatchObject({ status: "success", compatibility, message: "Este modelo ya existe; lo seleccionamos." });
    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(mocks.resolve.mock.calls[0]?.[1]).toMatchObject({ model: "75h78g" });
  });
  it("rejects an invalid brand before resolution", async () => {
    const body = new FormData(); body.set("brandId", "stale"); body.set("model", "75H78G");
    expect(await addCompatibleModelInlineAction(body)).toMatchObject({ status: "error", fieldErrors: { brandId: expect.any(Array) } });
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
