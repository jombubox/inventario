import { describe, expect, it } from "vitest";

import {
  catalogFilterCount,
  catalogQueryRecord,
  parseCatalogSearchParams,
} from "@/features/catalog/domain/catalog-query";

describe("catalog URL state", () => {
  it("validates and normalizes every public search parameter", () => {
    const query = parseCatalogSearchParams({
      q: "  BN94  ",
      marca: "SAMSUNG",
      tipo: "mainboard",
      modelo: "  UN55  ",
      condicion: "USED_GOOD",
      disponibilidad: "pocas",
      precioMin: "500",
      precioMax: "100",
      sort: "precio-desc",
      page: "2",
    });

    expect(query).toEqual({
      q: "BN94",
      marca: "samsung",
      tipo: "mainboard",
      modelo: "UN55",
      condicion: "USED_GOOD",
      disponibilidad: "pocas",
      precioMin: 100,
      precioMax: 500,
      sort: "precio-desc",
      page: 2,
    });
    expect(catalogFilterCount(query)).toBe(7);
  });

  it("falls back safely for invalid pagination, sort, slugs and prices", () => {
    expect(
      parseCatalogSearchParams({
        page: "-12",
        sort: "DROP TABLE products",
        marca: "not/a/slug",
        precioMin: "NaN",
      }),
    ).toEqual({ sort: "recientes", page: 1 });
  });

  it("preserves filters while resetting page and omits default URL noise", () => {
    const query = parseCatalogSearchParams({
      q: "BN94",
      marca: "samsung",
      disponibilidad: "disponible",
      page: "4",
    });
    expect(catalogQueryRecord(query, { page: 1 })).toEqual({
      q: "BN94",
      marca: "samsung",
      disponibilidad: "disponible",
    });
    expect(catalogQueryRecord(query, { marca: undefined, page: 1 })).toEqual({
      q: "BN94",
      disponibilidad: "disponible",
    });
  });
});

