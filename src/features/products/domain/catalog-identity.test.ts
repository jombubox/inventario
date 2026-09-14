import { describe, expect, it } from "vitest";

import { buildCatalogIdentity } from "@/features/products/domain/catalog-identity";

describe("custom catalog identity", () => {
  it("builds valid stable codes and slugs", () => {
    expect(buildCatalogIdentity("  Marca Ñueva TV  ", "brand")).toEqual({
      code: "MAR",
      slug: "marca-nueva-tv",
    });
    expect(buildCatalogIdentity("X", "componentType")).toEqual({
      code: "X0",
      slug: "x",
    });
  });

  it("adds a bounded suffix when a code or slug collides", () => {
    expect(buildCatalogIdentity("Marca Nueva", "brand", 2)).toEqual({
      code: "MAR02",
      slug: "marca-nueva-2",
    });
  });
});
