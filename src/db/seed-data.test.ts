import { describe, expect, it } from "vitest";

import {
  assertSeedDataIsInternallyUnique,
  brandAliasSeedRecords,
  brandSeedRecords,
  componentTypeAliasSeedRecords,
  componentTypeSeedRecords,
} from "@/db/seed-data";

describe("seed data", () => {
  it("contains the requested catalogs and stable codes", () => {
    expect(brandSeedRecords).toHaveLength(10);
    expect(componentTypeSeedRecords).toHaveLength(8);
    expect(brandSeedRecords).toContainEqual(
      expect.objectContaining({ normalizedName: "SAMSUNG", code: "SAM" }),
    );
    expect(componentTypeSeedRecords).toContainEqual(
      expect.objectContaining({ normalizedName: "TARJETA UNICA", code: "TU" }),
    );
  });

  it("contains all initial normalized aliases", () => {
    expect(brandAliasSeedRecords.map(({ normalizedAlias }) => normalizedAlias)).toEqual([
      "HISSENSE",
    ]);
    expect(
      componentTypeAliasSeedRecords.map(({ normalizedAlias }) => normalizedAlias),
    ).toEqual(["T-COM", "T. U.", "T.U."]);
  });

  it("has no duplicate conflict keys", () => {
    expect(assertSeedDataIsInternallyUnique).not.toThrow();
  });
});
