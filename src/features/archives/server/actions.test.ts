import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), restore: vi.fn(), archive: vi.fn(), db: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/db", () => ({ getDb: mocks.db }));
vi.mock("@/features/auth/server/admin-auth", () => ({ requireAdmin: mocks.authenticate }));
vi.mock("./archive-service", () => ({ restoreArchivedRecord: mocks.restore }));
vi.mock("./revalidation", () => ({ revalidateArchiveViews: mocks.revalidate }));
vi.mock("@/features/locations/server/location-service", () => ({ setLocationArchived: mocks.archive }));
import { archiveLocationAction, restoreArchivedAction } from "./actions";
import { archiveProductAction } from "@/features/products/server/actions";
import { archiveBrandAction, archiveComponentTypeAction } from "@/features/products/server/catalog-actions";
import { deleteBoxAction } from "@/features/locations/server/actions";

function form() {
  return Object.entries({ categoria: "productos", id: "00000000-0000-4000-8000-000000000001", expectedUpdatedAt: "2026-10-22T12:00:00Z" }).reduce((data, [key, value]) => { data.set(key, value); return data; }, new FormData());
}
describe("archive action security", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([archiveLocationAction, restoreArchivedAction, archiveProductAction, archiveBrandAction, archiveComponentTypeAction, deleteBoxAction])("blocks unauthorized calls before accessing the database", async (action) => {
    mocks.authenticate.mockRejectedValue(new Error("Unauthorized"));
    await expect(action({ status: "idle" }, form())).rejects.toThrow("Unauthorized");
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });
  it.each([archiveLocationAction, restoreArchivedAction])("rejects invalid IDs before persistence", async (action) => {
    const data = form(); data.set("id", "invalid");
    expect(await action({ status: "idle" }, data)).toMatchObject({ status: "error" });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("forwards a validated restore and invalidates dependent views", async () => {
    expect(await restoreArchivedAction({ status: "idle" }, form())).toMatchObject({ status: "success", message: "Producto restaurado correctamente." });
    expect(mocks.restore).toHaveBeenCalledWith(undefined, expect.objectContaining({ categoria: "productos", expectedUpdatedAt: new Date("2026-10-22T12:00:00Z") }));
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });
});
