import { describe, expect, it } from "vitest";

import {
  initialBrandAliases,
  initialComponentTypeAliases,
} from "@/db/seed-data";
import {
  resolveBrandAlias,
  resolveComponentTypeAlias,
} from "@/features/products/domain/aliases";

describe("legacy aliases", () => {
  it("maps HISSENSE to HISENSE", () => {
    expect(resolveBrandAlias("HISSENSE", initialBrandAliases)).toBe("HISENSE");
  });

  it("maps T-COM to T-CON", () => {
    expect(resolveComponentTypeAlias("T-COM", initialComponentTypeAliases)).toBe(
      "T-CON",
    );
  });

  it.each(["T. U.", "T.U."])("maps %s to TARJETA UNICA", (value) => {
    expect(resolveComponentTypeAlias(value, initialComponentTypeAliases)).toBe(
      "TARJETA UNICA",
    );
  });

  it("handles trivial casing through normalization without an alias", () => {
    expect(resolveComponentTypeAlias(" fuente ", initialComponentTypeAliases)).toBe(
      "FUENTE",
    );
  });
});
