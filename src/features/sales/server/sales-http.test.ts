import { describe, expect, it, vi } from "vitest";
vi.mock("@/db", () => ({ getDb: vi.fn(() => { throw new Error("Unauthorized request reached database"); }) }));
import { GET as list, POST as create } from "@/app/api/admin/sales/route";
import { GET as stock } from "@/app/api/admin/sales/stock/route";
import { GET as detail, POST as mutate } from "@/app/api/admin/sales/[id]/route";
import { GET as download } from "@/app/api/admin/sales/export/route";
import { readSalesJson } from "./sales-http";

describe("sales HTTP security", () => {
  it("requires a signed admin session before every query, mutation and export", async () => {
    const id = crypto.randomUUID(); const context = { params: Promise.resolve({ id }) };
    const requests = [list(new Request("http://localhost/api/admin/sales")), create(new Request("http://localhost/api/admin/sales", { method: "POST" })), stock(new Request("http://localhost/api/admin/sales/stock")), detail(new Request(`http://localhost/api/admin/sales/${id}`), context), mutate(new Request(`http://localhost/api/admin/sales/${id}`, { method: "POST" }), context), download(new Request("http://localhost/api/admin/sales/export")), download(new Request("http://localhost/api/admin/sales/export?report=true"))];
    for (const response of await Promise.all(requests)) { expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toContain("no-store"); expect(await response.text()).not.toContain("customer"); }
  });
  it("bounds streamed bodies even with a forged Content-Length", async () => { await expect(readSalesJson(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json", "content-length": "2" }, body: JSON.stringify({ notes: "x".repeat(65536) }) }))).rejects.toThrow(/64 KB/u); });
  it("rejects malformed and non-JSON bodies", async () => { await expect(readSalesJson(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "<html>" }))).rejects.toThrow(/válidos/u); await expect(readSalesJson(new Request("http://localhost", { method: "POST", body: "{}" }))).rejects.toThrow(/JSON/u); });
});
