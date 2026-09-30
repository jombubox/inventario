import { describe, expect, it } from "vitest";

import { quickAddInventoryMutationSchema } from "@/validators/quick-add-inventory";

const id = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const thirdId = "00000000-0000-4000-8000-000000000003";

const validExisting = {
  productMode: "existing",
  productId: id,
  brandId: null,
  customBrandName: null,
  componentTypeId: null,
  customComponentTypeName: null,
  partNumber: null,
  compatibleModel: null,
  title: null,
  locationId: secondId,
  boxMode: "existing",
  boxId: thirdId,
  newBoxCode: null,
  newBoxName: null,
  bagLabel: "",
  quantity: "10",
};

describe("quickAddInventoryMutationSchema", () => {
  it("accepts existing models with an existing box and optional bag", () => {
    expect(quickAddInventoryMutationSchema.parse(validExisting)).toMatchObject({
      productId: id,
      bagLabel: null,
      quantity: 10,
    });
    expect(quickAddInventoryMutationSchema.parse({ ...validExisting, bagLabel: " Bolsa 4 " })).toMatchObject({ bagLabel: "Bolsa 4" });
  });

  it.each(["Bolsa 1", "B-14", "A", "12", "Bolsa azul"])(
    "preserves the free-form bag label %s",
    (bagLabel) => {
      expect(
        quickAddInventoryMutationSchema.parse({ ...validExisting, bagLabel }).bagLabel,
      ).toBe(bagLabel);
    },
  );

  it.each(["", "   ", "\t\r\n"])("normalizes empty bag label %j to null", (bagLabel) => {
    expect(
      quickAddInventoryMutationSchema.parse({ ...validExisting, bagLabel }).bagLabel,
    ).toBeNull();
  });

  it.each(["0", "-1", "1.5", "not-a-number"])("rejects invalid quantity %s", (quantity) => {
    expect(quickAddInventoryMutationSchema.safeParse({ ...validExisting, quantity }).success).toBe(false);
  });

  it("requires both inline box identifiers", () => {
    const result = quickAddInventoryMutationSchema.safeParse({
      ...validExisting,
      boxMode: "new",
      boxId: null,
      newBoxCode: "",
      newBoxName: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors).toMatchObject({
        newBoxCode: expect.any(Array),
        newBoxName: expect.any(Array),
      });
    }
  });

  it("requires identity fields for a new model", () => {
    const result = quickAddInventoryMutationSchema.safeParse({
      ...validExisting,
      productMode: "new",
      productId: null,
      brandId: id,
      componentTypeId: secondId,
      partNumber: "",
      compatibleModel: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.partNumber).toBeTruthy();
  });

  it("accepts and normalizes serials only as new-model metadata", () => {
    const parsed = quickAddInventoryMutationSchema.parse({
      ...validExisting,
      productMode: "new",
      productId: null,
      brandId: id,
      componentTypeId: secondId,
      partNumber: "QA-SERIAL-1",
      primarySerialNumber: "  MAIN-1 ",
      secondarySerialNumbers: [" ALT-1 ", "   "],
    });
    expect(parsed.primarySerialNumber).toBe("MAIN-1");
    expect(parsed.secondarySerialNumbers).toEqual(["ALT-1"]);
  });

  it("rejects duplicate serials for a new model", () => {
    const parsed = quickAddInventoryMutationSchema.safeParse({
      ...validExisting,
      productMode: "new",
      productId: null,
      brandId: id,
      componentTypeId: secondId,
      partNumber: "QA-SERIAL-2",
      primarySerialNumber: "MAIN-1",
      secondarySerialNumbers: ["main-1"],
    });
    expect(parsed.success).toBe(false);
  });
});
