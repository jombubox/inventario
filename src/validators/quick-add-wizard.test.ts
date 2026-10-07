import { describe, expect, it } from "vitest";
import { quickAddInventoryMutationSchema, quickAddWizardSchemas } from "./quick-add-inventory";
import { quickAddErrorStep } from "@/features/inventory/domain/quick-add-wizard";

const id = "11111111-1111-4111-8111-111111111111";
const valid = {
  productMode: "new", brandId: id, componentTypeId: id,
  title: "Fuente", partNumber: "PART-1", primarySerialNumber: "ABC-1",
  secondarySerialNumbers: ["XYZ-1"], compatibilities: [],
  locationId: id, boxMode: "existing", boxId: id, quantity: 5,
  salePrice: "1250.01", warranty: "  30   días  ", condition: "USED", status: "ACTIVE", isPublic: true,
};

describe("Quick Add wizard shares the server contract", () => {
  it("requires both catalog selections at step 1, regardless of missing later fields", () => {
    const result = quickAddWizardSchemas[1].safeParse({ brandId: "", componentTypeId: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors).toEqual({ brandId: ["Selecciona una marca."], componentTypeId: ["Selecciona un tipo de pieza."] });
  });
  it("keeps title and serials optional and defers the part/model alternative until step 3", () => {
    expect(quickAddWizardSchemas[2].safeParse({ title: "", partNumber: "", secondarySerialNumbers: [] }).success).toBe(true);
    expect(quickAddWizardSchemas[3].safeParse({ partNumber: "", compatibilities: [] }).success).toBe(false);
    expect(quickAddWizardSchemas[3].safeParse({ partNumber: "", compatibilities: [{ brandId: id, model: "TV-1" }] }).success).toBe(true);
    expect(quickAddWizardSchemas[3].safeParse({ partNumber: "PART", compatibilities: [] }).success).toBe(true);
  });
  it("normalizes serials and rejects duplicates and excessive lengths in step 2", () => {
    expect(quickAddWizardSchemas[2].safeParse({ ...valid, secondarySerialNumbers: [" abc-1 "] }).success).toBe(false);
    expect(quickAddWizardSchemas[2].safeParse({ ...valid, primarySerialNumber: "a".repeat(161) }).success).toBe(false);
  });
  it("requires a box, positive integer stock and the existing decimal-price format", () => {
    for (const change of [{ quantity: 0 }, { quantity: 1.5 }, { quantity: 1_000_001 }, { boxId: "" }, { salePrice: "1,250" }, { salePrice: "-1" }, { warranty: "a".repeat(241) }]) {
      expect(quickAddWizardSchemas[5].safeParse({ ...valid, ...change }).success).toBe(false);
    }
    expect(quickAddWizardSchemas[5].safeParse({ ...valid, salePrice: "", warranty: "", boxMode: "new", boxId: "", newBoxCode: "18", newBoxName: "Caja 18" }).success).toBe(true);
  });
  it("validates the complete payload again and omits product fields from existing stock entry", () => {
    const result = quickAddInventoryMutationSchema.parse(valid);
    expect(result).toMatchObject({ warranty: "30 días", currency: "MXN", condition: "USED" });
    const existing = quickAddInventoryMutationSchema.parse({ ...valid, productMode: "existing", productId: id, warranty: 123, salePrice: "invalid", brandId: "invalid" });
    expect(existing).not.toHaveProperty("warranty");
    expect(existing).not.toHaveProperty("brandId");
  });
  it("routes server validation and stale-domain errors to the relevant step", () => {
    expect(quickAddErrorStep({ brandId: ["error"] })).toBe(1);
    expect(quickAddErrorStep({ secondarySerialNumbers: ["error"] })).toBe(2);
    expect(quickAddErrorStep({ compatibilities: ["error"] })).toBe(3);
    expect(quickAddErrorStep(undefined, "Una marca de los modelos compatibles ya no existe o está inactiva.")).toBe(3);
    expect(quickAddErrorStep(undefined, "La ubicación ya no existe o está inactiva.")).toBe(5);
  });
});
