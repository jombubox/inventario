import { describe, expect, it } from "vitest";

import {
  normalizeBrand,
  normalizeComponentType,
  normalizeModel,
  normalizePartNumber,
  normalizeSkuToken,
} from "@/features/products/domain/product-normalization";
import {
  normalizeWhitespace,
  slugify,
} from "@/features/shared/domain/text-normalization";

describe("product normalization", () => {
  it.each([" Samsung ", " SAMSUNG ", "samsung"])(
    "normalizes equivalent Samsung spellings: %s",
    (value) => expect(normalizeBrand(value)).toBe("SAMSUNG"),
  );

  it("collapses whitespace without destroying display punctuation", () => {
    expect(normalizeWhitespace("  Tarjeta   Única  ")).toBe("Tarjeta Única");
  });

  it("normalizes component accents for comparison", () => {
    expect(normalizeComponentType(" tarjeta única ")).toBe("TARJETA UNICA");
  });

  it("normalizes part numbers and models into alphanumeric identity tokens", () => {
    expect(normalizePartNumber(" bn94-07820f ")).toBe("BN9407820F");
    expect(normalizeSkuToken(" bn94-07820f ")).toBe("BN9407820F");
    expect(normalizeModel(" UN58H5200S-XZX ")).toBe("UN58H5200SXZX");
  });

  it("creates an ASCII URL slug", () => {
    expect(slugify("Tarjeta Única | Samsung")).toBe("tarjeta-unica-samsung");
  });
});
