import { beforeEach, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/features/auth/domain/auth-errors";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), review: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("@/features/auth/server/admin-auth", () => ({ requireAdmin: mocks.authenticate }));
vi.mock("@/features/products/data/admin-product-queries", () => ({ getAdminProductReview: mocks.review }));
import { GET } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => { mocks.authenticate.mockReset(); mocks.review.mockReset(); });

it("requires admin access before reading any private review data", async () => {
  mocks.authenticate.mockRejectedValue(new UnauthorizedError("Authentication required"));
  const response = await GET(new Request(`http://localhost/api/admin/products/${id}/review`), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.review).not.toHaveBeenCalled();
});
it("returns only authenticated review data without caching it", async () => {
  mocks.review.mockResolvedValue({ images: [], compatibilities: [{ brand: "Samsung", model: "MODELO" }] });
  const response = await GET(new Request(`http://localhost/api/admin/products/${id}/review`), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("private, no-store");
  expect(await response.json()).toEqual({ images: [], compatibilities: [{ brand: "Samsung", model: "MODELO" }] });
});
