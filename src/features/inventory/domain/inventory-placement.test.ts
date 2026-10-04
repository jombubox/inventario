import { describe, expect, it } from "vitest";
import { createInventoryPlacementResolver } from "./inventory-placement";

const nodes = [
  { id: "warehouse", name: "Almacén norte", parentId: null, type: "WAREHOUSE" as const },
  { id: "shelf", name: "Estante A", parentId: "warehouse", type: "SHELF" as const },
  { id: "box", name: "Caja 18", parentId: "shelf", type: "BOX" as const },
  { id: "bag", name: "7", parentId: "box", type: "BAG" as const },
  { id: "rootbox", name: "20", parentId: null, type: "BOX" as const },
];
describe("inventory placement", () => {
  it("uses the actual box and nearest physical bag with parent context", () => {
    expect(createInventoryPlacementResolver(nodes)("bag", null)).toEqual({ boxLabel: "Caja 18", bagLabel: "Bolsa 7", parentLocation: "Almacén norte > Estante A" });
  });
  it("preserves an explicit bag label without duplicating its prefix", () => {
    expect(createInventoryPlacementResolver(nodes)("box", "Bolsa 9")).toMatchObject({ boxLabel: "Caja 18", bagLabel: "Bolsa 9" });
  });
  it("handles a box without bag or parent", () => {
    expect(createInventoryPlacementResolver(nodes)("rootbox", null)).toEqual({ boxLabel: "Caja 20", bagLabel: "Sin bolsa", parentLocation: "Sin ubicación padre" });
  });
  it("does not invent a box from a warehouse or missing location", () => {
    const resolve = createInventoryPlacementResolver(nodes);
    expect(resolve("warehouse", null)).toMatchObject({ boxLabel: "Sin caja", parentLocation: "Almacén norte" });
    expect(resolve(null, null)).toMatchObject({ boxLabel: "Sin caja", bagLabel: "Sin bolsa", parentLocation: "Sin ubicación" });
  });
  it("keeps the hierarchy cycle guard", () => {
    expect(() => createInventoryPlacementResolver([{ id: "a", name: "A", parentId: "a", type: "BOX" }])("a", null)).toThrow(/Cycle/);
  });
});
