import { describe, expect, it } from "vitest";
import { z } from "zod";
import { inventoryInformationFields } from "./inventory-information";
import { quickAddInventoryMutationSchema, quickAddWizardSchemas } from "./quick-add-inventory";
import { updateInventoryDetailsMutationSchema } from "./admin-inventory";

const schema = z.object(inventoryInformationFields);
const id = "00000000-0000-4000-8000-000000000001";
const entry = { productMode: "existing", productId: id, locationId: id, boxMode: "existing", boxId: id, quantity: 2 };

describe("inventory entry information", () => {
  it("preserves Spanish punctuation and line breaks and normalizes empty values", () => {
    expect(schema.parse({ acquisitionSource: "  Taller   León ", notes: "Revisado: sí.\r\nConector dañado; ¿reparar?\n<html>texto</html>" })).toMatchObject({
      acquisitionSource: "Taller León", acquiredAt: null, notes: "Revisado: sí.\nConector dañado; ¿reparar?\n<html>texto</html>",
    });
    expect(schema.parse({ acquisitionSource: "  ", notes: "\n ", acquiredAt: "" })).toEqual({ acquisitionSource: null, notes: null, acquiredAt: null });
  });

  it.each(["2024-02-29", "2026-10-13", "2026-01-01", "2026-12-31"])("keeps calendar date %s at the SQL DATE boundary", (date) => {
    const parsed = schema.parse({ acquiredAt: date });
    expect(parsed.acquiredAt?.toISOString()).toBe(`${date}T00:00:00.000Z`);
    expect(schema.parse(parsed).acquiredAt).toEqual(parsed.acquiredAt);
  });

  it.each(["0000-01-01", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "13/10/2026", "2026-10-13T23:00:00-06:00", "not a date"])("rejects invalid or timestamp input %s", (acquiredAt) => {
    expect(schema.safeParse({ acquiredAt }).success).toBe(false);
  });

  it("bounds notes and source on the server", () => {
    expect(schema.safeParse({ notes: "a".repeat(5001) }).success).toBe(false);
    expect(schema.safeParse({ acquisitionSource: "a".repeat(501) }).success).toBe(false);
    expect(schema.safeParse({ notes: "a".repeat(5000) }).success).toBe(true);
  });

  it("accepts optional provenance in the short inventory flow without product master fields", () => {
    const input = quickAddInventoryMutationSchema.parse({ ...entry, acquisitionSource: "Proveedor A", acquiredAt: "2026-10-13", notes: "Uno\nDos", title: "Do not edit", warranty: "invalid" });
    expect(input).toMatchObject({ acquisitionSource: "Proveedor A", acquiredAt: new Date("2026-10-13T00:00:00Z"), notes: "Uno\nDos" });
    expect(input).not.toHaveProperty("title");
    expect(input).not.toHaveProperty("warranty");
    expect(quickAddInventoryMutationSchema.safeParse(entry).success).toBe(true);
  });

  it("validates the same fields in wizard step 5 and inventory editing", () => {
    const information = { acquisitionSource: "Proveedor", acquiredAt: "2026-10-13", notes: "Primera línea\nSegunda línea" };
    expect(quickAddWizardSchemas[5].parse({ ...entry, ...information, salePrice: null, warranty: null, condition: "USED", status: "ACTIVE", isPublic: true })).toMatchObject({ notes: information.notes });
    expect(updateInventoryDetailsMutationSchema.parse({ id, expectedUpdatedAt: "2026-10-13T12:00:00Z", condition: "UNKNOWN", purchaseCost: null, ...information })).toMatchObject({ notes: information.notes, acquiredAt: new Date("2026-10-13T00:00:00Z") });
  });
});
