import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { detectImportMapping, parseXlsxWorkbook } from "@/features/imports/server/xlsx-parser";

describe("legacy XLSX parser", () => {
  it("maps legacy SKU to physical legacy location and never to ExistingSKU", () => {
    const mapping = detectImportMapping([
      "N° Bolsa",
      "Marca",
      "Modelo",
      "Tarjeta",
      "SKU",
      "Número de Parte",
      "Título",
      "FECHA DE COMPRA",
      "DSC",
    ]);
    expect(mapping).toMatchObject({
      legacyBagNumber: "N° Bolsa",
      brand: "Marca",
      compatibleModel: "Modelo",
      componentType: "Tarjeta",
      legacyLocationCode: "SKU",
      partNumber: "Número de Parte",
      legacyTitle: "Título",
      acquiredAt: "FECHA DE COMPRA",
      acquisitionSource: "DSC",
    });
    expect(mapping.existingSku).toBeUndefined();
  });

  it("reads a synthetic Humeberto workbook and retains J1B# as legacyLocationCode", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Humeberto");
    sheet.addRow(["N° Bolsa", "Marca", "Modelo", "Tarjeta", "SKU", "Número de Parte", "Título", "FECHA DE COMPRA", "DSC", "Dato extra"]);
    sheet.addRow(["42", "HISSENSE", "50H5G", "T-COM", "J1B7", "RSAG7.820", "Título anterior", "31/01/2025", "Compra local", "aprox. 150"]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const parsed = await parseXlsxWorkbook(bytes);
    expect(parsed.sheetName).toBe("Humeberto");
    expect(parsed.mapping.legacyLocationCode).toBe("SKU");
    expect(parsed.mapping.existingSku).toBeUndefined();
    expect(parsed.rows[0]).toMatchObject({
      rowNumber: 2,
      values: { legacyLocationCode: "J1B7", legacyBagNumber: "42" },
    });
  });
});
