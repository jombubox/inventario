import { describe, expect, it } from "vitest";

import {
  assertSeedDataIsInternallyUnique,
  brandAliasSeedRecords,
  brandSeedRecords,
  componentTypeAliasSeedRecords,
  componentTypeSeedRecords,
} from "@/db/seed-data";
import { normalizeBrand } from "@/features/products/domain/product-normalization";

const requestedBrandNames = [
  "Samsung",
  "LG",
  "TCL",
  "Hisense",
  "Philips",
  "Alux",
  "Pioneer",
  "Haier",
  "AOC",
  "China",
  "RCA",
  "Cobia",
  "Blusens",
  "Westinghouse",
  "Vios",
  "Sansui",
  "Digitrex",
  "Polaroid",
  "Funai",
  "Atvio",
  "Mover a México",
  "Panasonic",
  "HP",
  "Hitachi",
  "Toshiba",
  "Infocus",
  "Aurus",
  "Speeler",
  "Olevia",
  "Inco",
  "Kodak",
  "Mitsui",
  "Supersonic",
  "Vizio",
  "Sunbrite TV",
  "Supersonica",
  "Spectra",
  "Insignia",
  "TMK",
  "Viore",
  "Daewoo",
  "Seiki",
  "Rowa",
  "Dynex",
  "Element",
  "Envision",
  "EKT",
  "Ghia",
  "Proscan",
  "Naxa",
  "Dinex",
  "Sharp",
  "JVC",
  "ONN",
  "Konka",
  "Hiteker",
  "Fanco",
  "Jensen",
  "Hyundai",
  "Sanyo",
  "Emerson",
  "Akai",
  "DELL",
  "Digital Stream",
  "Komodo TV",
  "Magnavox",
  "Hk Pro",
  "Quasar",
  "Spectre",
  "Sony",
  "MSI",
  "Speler",
  "Memorex",
  "Asus",
  "Silo",
] as const;

describe("seed data", () => {
  it("contains the requested catalogs and stable codes", () => {
    expect(brandSeedRecords).toHaveLength(requestedBrandNames.length);
    expect(componentTypeSeedRecords).toHaveLength(8);
    expect(brandSeedRecords.map(({ name }) => name)).toEqual(
      expect.arrayContaining([...requestedBrandNames]),
    );
    expect(new Set(requestedBrandNames.map(normalizeBrand)).size).toBe(
      requestedBrandNames.length,
    );
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
