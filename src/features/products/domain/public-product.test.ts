import { describe, expect, it } from "vitest";
import { productPublicationPath, publicProductPath } from "./public-product";

describe("public product routes", () => {
  it.each(["ACTIVE", "DRAFT", "ARCHIVED"])("requires active, visible and not deleted for %s", (status) => {
    for (const isPublic of [true, false]) {
      for (const deletedAt of [null, new Date()]) {
        expect(productPublicationPath({ slug: "sensor-bosch", status, isPublic, deletedAt }))
          .toBe(status === "ACTIVE" && isPublic && !deletedAt ? "/catalogo/sensor-bosch" : null);
      }
    }
  });
  it("encodes the current slug as a single path segment", () => {
    expect(publicProductPath("sensor-bosch")).toBe("/catalogo/sensor-bosch");
    expect(publicProductPath("a/b")).toBe("/catalogo/a%2Fb");
  });
});
