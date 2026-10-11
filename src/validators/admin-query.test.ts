import { describe, expect, it } from "vitest";
import { inventoryListQuerySchema, productListQuerySchema } from "./admin-query";

describe("admin search query parsing", () => {
  it("accepts the empty filters emitted by native Products forms", () => {
    expect(productListQuerySchema.parse({ q: "  BN94  ", status: "", stock: "", public: "" }))
      .toMatchObject({ q: "BN94", status: undefined, stock: undefined, public: undefined, page: 1 });
  });
  it("accepts empty Inventory filters and clears whitespace", () => {
    expect(inventoryListQuerySchema.parse({ q: "   ", condition: "", status: "", unlocated: "" }))
      .toMatchObject({ q: "", condition: undefined, status: undefined, unlocated: undefined });
  });
  it("retains explicit false and valid enums and rejects malformed filters", () => {
    expect(productListQuerySchema.parse({ public: "false", status: "ACTIVE" })).toMatchObject({ public: false, status: "ACTIVE" });
    expect(inventoryListQuerySchema.safeParse({ status: "wrong" }).success).toBe(false);
  });
});

it("accepts only exact UUID inventory product filters", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  expect(inventoryListQuerySchema.parse({ productId: id }).productId).toBe(id);
  expect(inventoryListQuerySchema.parse({ productId: "" }).productId).toBeUndefined();
  expect(inventoryListQuerySchema.safeParse({ productId: "Samsung" }).success).toBe(false);
});
