import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { templateInventoryHeaders } from "@/features/imports/domain/import-types";
import { buildInventoryTemplateFromCatalogs } from "@/features/imports/server/template-workbook";

describe("JombuBox inventory template", () => {
  it("contains the three required sheets, exact headers and guarded catalogs", async () => {
    const buffer = await buildInventoryTemplateFromCatalogs({
      brandRows: [{ name: "=DANGEROUS()" }, { name: "Samsung" }],
      typeRows: [{ name: "Mainboard" }],
      locationRows: [{ id: "location-1", code: "J1B1", name: "Caja 1", parentId: null, type: "BOX" }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as ExcelJS.Buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Inventario", "Catalogos", "README"]);
    const inventory = workbook.getWorksheet("Inventario")!;
    expect(inventory.getRow(1).values).toEqual([undefined, ...templateInventoryHeaders]);
    expect(inventory.getCell("C2").dataValidation.type).toBe("list");
    expect(inventory.getCell("H2").dataValidation.type).toBe("whole");
    expect(inventory.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(workbook.getWorksheet("Catalogos")!.getCell("A2").value).toBe("'=DANGEROUS()");
    const readmeText = workbook.getWorksheet("README")!.getColumn(2).values.join(" ");
    expect(readmeText).toContain("No escribas códigos J1B# en ExistingSKU");
  });
});
