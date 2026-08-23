import { describe, expect, it } from "vitest";

import {
  assertValidLocationParent,
  buildLocationBreadcrumb,
  InvalidLocationHierarchyError,
  type LocationNode,
} from "@/features/locations/domain/location-hierarchy";

const locations: LocationNode[] = [
  { id: "warehouse", name: "Almacén", parentId: null },
  { id: "shelf", name: "J1", parentId: "warehouse" },
  { id: "box", name: "Caja 03", parentId: "shelf" },
  { id: "bag", name: "Bolsa 012", parentId: "box" },
];

describe("buildLocationBreadcrumb", () => {
  it("supports an arbitrary-depth hierarchy", () => {
    expect(buildLocationBreadcrumb("bag", locations)).toBe(
      "Almacén > J1 > Caja 03 > Bolsa 012",
    );
  });

  it("supports a root and a depth-two location", () => {
    expect(buildLocationBreadcrumb("warehouse", locations)).toBe("Almacén");
    expect(buildLocationBreadcrumb("shelf", locations)).toBe("Almacén > J1");
  });

  it("rejects corrupt cycles and missing parents", () => {
    expect(() =>
      buildLocationBreadcrumb("a", [
        { id: "a", name: "A", parentId: "b" },
        { id: "b", name: "B", parentId: "a" },
      ]),
    ).toThrow(InvalidLocationHierarchyError);
    expect(() =>
      buildLocationBreadcrumb("orphan", [
        { id: "orphan", name: "Orphan", parentId: "missing" },
      ]),
    ).toThrow(/Parent location not found/u);
  });
});

describe("assertValidLocationParent", () => {
  it("prevents moving a location below one of its descendants", () => {
    expect(() =>
      assertValidLocationParent({
        locationId: "warehouse",
        nextParentId: "bag",
        locations,
      }),
    ).toThrow(/cycle/u);
  });

  it("accepts a root location", () => {
    expect(() =>
      assertValidLocationParent({ locationId: "warehouse", nextParentId: null, locations }),
    ).not.toThrow();
  });
});
