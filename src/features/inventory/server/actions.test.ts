import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn(), authenticate: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/server/admin-auth", () => ({ requireAdmin: mocks.authenticate }));
vi.mock("@/features/catalog/server/revalidation", () => ({ revalidatePublicCatalog: vi.fn() }));
vi.mock("@/features/inventory/server/quick-add-service", () => ({ quickAddInventory: mocks.save }));

import { quickAddInventoryAction } from "./actions";

function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    productMode: "new", brandId: "00000000-0000-4000-8000-000000000001",
    componentTypeId: "00000000-0000-4000-8000-000000000002", partNumber: "NEW-PRICE",
    locationId: "00000000-0000-4000-8000-000000000003", boxId: "00000000-0000-4000-8000-000000000004",
    boxMode: "existing", quantity: "5", salePrice: "1250.01", currency: "USD",
  })) data.set(key, value);
  return data;
}

describe("Quick Add publication action", () => {
  beforeEach(() => {
    mocks.save.mockReset();
    mocks.authenticate.mockReset();
    mocks.save.mockResolvedValue({ product: { id: "created", slug: "sensor-new", status: "ACTIVE", isPublic: true }, productCreated: true, box: { name: "Caja A03" } });
  });
  it("passes validated money with MXN and Active/public defaults to the existing service", async () => {
    const state = await quickAddInventoryAction({ status: "idle" }, form());
    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0]?.[1]).toMatchObject({ salePrice: "1250.01", condition: "NEW", currency: "MXN", status: "ACTIVE", isPublic: true });
    expect(state).toMatchObject({ status: "success", productCreated: true, publicationPath: "/catalogo/sensor-new" });
  });
  it("preserves an explicit private choice and hides the public link", async () => {
    const data = form(); data.set("isPublic", "false");
    mocks.save.mockResolvedValue({ product: { id: "created", slug: "sensor-new", status: "ACTIVE", isPublic: false }, productCreated: true, box: { name: "Caja A03" } });
    expect(await quickAddInventoryAction({ status: "idle" }, data)).toMatchObject({ publicationPath: null });
    expect(mocks.save.mock.calls[0]?.[1]).toMatchObject({ isPublic: false });
  });
  it("rejects malformed money before any persistence", async () => {
    const data = form(); data.set("salePrice", "1e100");
    expect(await quickAddInventoryAction({ status: "idle" }, data)).toMatchObject({ status: "error", fieldErrors: { salePrice: expect.any(Array) } });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("passes an explicit used condition and rejects arbitrary values", async () => {
    const data = form(); data.set("condition", "USED");
    await quickAddInventoryAction({ status: "idle" }, data);
    expect(mocks.save.mock.calls[0]?.[1]).toMatchObject({ condition: "USED" });
    mocks.save.mockClear(); data.set("condition", "USED_GOOD");
    expect(await quickAddInventoryAction({ status: "idle" }, data)).toMatchObject({ status: "error", fieldErrors: { condition: expect.any(Array) } });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
