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
  compatibilities: [],
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
  it("defaults new publication data to Active, public and MXN using decimal strings", () => {
    const input = { ...validExisting, productMode: "new", productId: null, brandId: id, componentTypeId: secondId, partNumber: "TEST-PRICE" };
    expect(quickAddInventoryMutationSchema.parse(input)).toMatchObject({ salePrice: null, currency: "MXN", status: "ACTIVE", isPublic: true });
    expect(quickAddInventoryMutationSchema.parse({ ...input, salePrice: "1250.01", isPublic: false })).toMatchObject({ salePrice: "1250.01", isPublic: false });
    expect(quickAddInventoryMutationSchema.parse({ ...input, salePrice: "0.00", status: "DRAFT" })).toMatchObject({ salePrice: "0.00", status: "DRAFT" });
  });
  it.each(["-1", "NaN", "Infinity", "1e3", "1,250.00", "12.345", "10000000000.00", "--1", "12abc"])("rejects invalid price %s", (salePrice) => {
    expect(quickAddInventoryMutationSchema.safeParse({ ...validExisting, productMode: "new", brandId: id, componentTypeId: secondId, partNumber: "TEST-PRICE", salePrice }).success).toBe(false);
  });
  it("accepts existing products with an existing box and optional bag", () => {
    expect(quickAddInventoryMutationSchema.parse(validExisting)).toMatchObject({
      productId: id,
      bagLabel: null,
      quantity: 10,
    });
    expect(quickAddInventoryMutationSchema.parse({ ...validExisting, bagLabel: " Bolsa 4 " })).toMatchObject({ bagLabel: "Bolsa 4" });
  });

  it("accepts an inventory-only payload without any new-product fields", () => {
    expect(quickAddInventoryMutationSchema.parse({
      productMode: "existing", productId: id, locationId: secondId,
      boxMode: "existing", boxId: thirdId, quantity: "3",
    })).toMatchObject({ productMode: "existing", productId: id, quantity: 3 });
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

  it("requires identity fields for a new product", () => {
    const result = quickAddInventoryMutationSchema.safeParse({
      ...validExisting,
      productMode: "new",
      productId: null,
      brandId: id,
      componentTypeId: secondId,
      partNumber: "",
      compatibilities: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors).toHaveProperty("partNumber");
  });

  it.each([0, 1, 3])(
    "accepts a new product with %i compatible models when it has a part number",
    (count) => {
      const compatibilities = Array.from({ length: count }, (_, index) => ({
        brandId: id,
        model: ` MODEL-${index + 1} `,
        notes: null,
      }));
      const parsed = quickAddInventoryMutationSchema.parse({
        ...validExisting,
        productMode: "new",
        productId: null,
        brandId: id,
        componentTypeId: secondId,
        partNumber: "PRODUCT-IDENTITY",
        compatibilities,
      });
      if (parsed.productMode !== "new") throw new Error("Expected new product input");
      expect(parsed.compatibilities).toHaveLength(count);
      if (count > 0) expect(parsed.compatibilities[0]?.model).toBe("MODEL-1");
    },
  );

  it("accepts compatible models as the identity when part number is absent", () => {
    const parsed = quickAddInventoryMutationSchema.parse({
      ...validExisting,
      productMode: "new",
      productId: null,
      brandId: id,
      componentTypeId: secondId,
      partNumber: "",
      compatibilities: [{ brandId: id, model: "MODEL-ONLY", notes: null }],
    });
    if (parsed.productMode !== "new") throw new Error("Expected new product input");
    expect(parsed.partNumber).toBeNull();
    expect(parsed.compatibilities).toEqual([
      { brandId: id, model: "MODEL-ONLY", notes: null },
    ]);
  });

  it("accepts and normalizes serials only as new-product metadata", () => {
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
    if (parsed.productMode !== "new") throw new Error("Expected new product input");
    expect(parsed.primarySerialNumber).toBe("MAIN-1");
    expect(parsed.secondarySerialNumbers).toEqual(["ALT-1"]);
  });

  it("rejects duplicate serials for a new product", () => {
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
