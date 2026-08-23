import "server-only";

import ExcelJS from "exceljs";
import { asc, eq } from "drizzle-orm";

import type { Database } from "@/db/connection";
import { brands, componentTypes, locations } from "@/db/schema";
import {
  inventoryConditionValues,
  inventoryStatusValues,
} from "@/db/schema/enums";
import { templateInventoryHeaders } from "@/features/imports/domain/import-types";
import { buildLocationBreadcrumb } from "@/features/locations/domain/location-hierarchy";
import { safeSpreadsheetText } from "@/features/exports/domain/spreadsheet-safety";

const HEADER_FILL = "FF0B1F3A";
const ACCENT_FILL = "FFF59E0B";
const WHITE = "FFFFFFFF";
const MAX_TEMPLATE_ROWS = 2_001;

function listValidation(range: string): ExcelJS.DataValidation {
  return {
    type: "list",
    allowBlank: true,
    formulae: [range],
    showErrorMessage: true,
    errorStyle: "stop",
    errorTitle: "Valor no válido",
    error: "Selecciona un valor de la lista.",
  };
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 30;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: { argb: ACCENT_FILL } },
    };
  });
}

export async function buildInventoryTemplate(db: Database): Promise<ArrayBuffer> {
  const [brandRows, typeRows, locationRows] = await Promise.all([
    db
      .select({ name: brands.name })
      .from(brands)
      .where(eq(brands.active, true))
      .orderBy(asc(brands.name)),
    db
      .select({ name: componentTypes.name })
      .from(componentTypes)
      .where(eq(componentTypes.active, true))
      .orderBy(asc(componentTypes.name)),
    db
      .select({
        id: locations.id,
        code: locations.code,
        name: locations.name,
        parentId: locations.parentId,
        type: locations.type,
      })
      .from(locations)
      .where(eq(locations.active, true))
      .orderBy(asc(locations.code)),
  ]);

  return buildInventoryTemplateFromCatalogs({ brandRows, typeRows, locationRows });
}

export function buildInventoryTemplateFromCatalogs({
  brandRows,
  typeRows,
  locationRows,
}: {
  brandRows: Array<{ name: string }>;
  typeRows: Array<{ name: string }>;
  locationRows: Array<{
    id: string;
    code: string;
    name: string;
    parentId: string | null;
    type: string;
  }>;
}): Promise<ArrayBuffer> {

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JombuBox";
  workbook.company = "JombuBox";
  workbook.subject = "Plantilla de importación de inventario";
  workbook.created = new Date();
  workbook.modified = new Date();

  const inventory = workbook.addWorksheet("Inventario", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 22 },
  });
  inventory.addRow([...templateInventoryHeaders]);
  styleHeader(inventory.getRow(1));
  inventory.autoFilter = { from: "A1", to: "T1" };
  const widths = [16, 20, 20, 24, 20, 20, 18, 11, 19, 15, 11, 16, 24, 16, 16, 18, 12, 28, 40, 40];
  widths.forEach((width, index) => {
    inventory.getColumn(index + 1).width = width;
  });

  const catalogs = workbook.addWorksheet("Catalogos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const catalogHeaders = [
    "Brands",
    "ComponentTypes",
    "Conditions",
    "InventoryStatuses",
    "Currencies",
    "IsPublic",
    "LocationCode",
    "LocationName",
    "LocationBreadcrumb",
    "LocationType",
  ];
  catalogs.addRow(catalogHeaders);
  styleHeader(catalogs.getRow(1));
  catalogs.columns.forEach((column, index) => {
    column.width = [24, 24, 20, 22, 14, 14, 20, 24, 48, 20][index];
  });
  const maxCatalogRows = Math.max(
    brandRows.length,
    typeRows.length,
    inventoryConditionValues.length,
    inventoryStatusValues.length,
    locationRows.length,
    2,
  );
  for (let index = 0; index < maxCatalogRows; index += 1) {
    const location = locationRows[index];
    catalogs.addRow([
      brandRows[index]?.name ? safeSpreadsheetText(brandRows[index]!.name) : null,
      typeRows[index]?.name ? safeSpreadsheetText(typeRows[index]!.name) : null,
      inventoryConditionValues[index] ?? null,
      inventoryStatusValues[index] ?? null,
      index === 0 ? "MXN" : null,
      index < 2 ? (index === 0 ? "FALSE" : "TRUE") : null,
      location ? safeSpreadsheetText(location.code) : null,
      location ? safeSpreadsheetText(location.name) : null,
      location
        ? safeSpreadsheetText(buildLocationBreadcrumb(location.id, locationRows))
        : null,
      location?.type ?? null,
    ]);
  }
  catalogs.autoFilter = { from: "A1", to: "J1" };

  const range = (column: string, size: number) =>
    `Catalogos!$${column}$2:$${column}$${Math.max(2, size + 1)}`;
  for (let row = 2; row <= MAX_TEMPLATE_ROWS; row += 1) {
    inventory.getCell(`C${row}`).dataValidation = listValidation(range("A", brandRows.length));
    inventory.getCell(`E${row}`).dataValidation = listValidation(range("B", typeRows.length));
    inventory.getCell(`G${row}`).dataValidation = listValidation(
      range("C", inventoryConditionValues.length),
    );
    inventory.getCell(`I${row}`).dataValidation = listValidation(
      range("D", inventoryStatusValues.length),
    );
    inventory.getCell(`K${row}`).dataValidation = listValidation(range("E", 1));
    inventory.getCell(`P${row}`).dataValidation = listValidation(
      range("G", locationRows.length),
    );
    inventory.getCell(`Q${row}`).dataValidation = listValidation(range("F", 2));
    inventory.getCell(`H${row}`).dataValidation = {
      type: "whole",
      operator: "greaterThan",
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "Cantidad no válida",
      error: "Quantity debe ser un entero mayor que cero.",
    };
    inventory.getCell(`J${row}`).numFmt = '[$$-es-MX]#,##0.00';
    inventory.getCell(`N${row}`).numFmt = '[$$-es-MX]#,##0.00';
    inventory.getCell(`L${row}`).numFmt = "yyyy-mm-dd";
  }

  const readme = workbook.addWorksheet("README", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  readme.getColumn(1).width = 26;
  readme.getColumn(2).width = 100;
  readme.mergeCells("A1:B1");
  readme.getCell("A1").value = "JombuBox · Plantilla de inventario";
  readme.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_FILL },
  };
  readme.getCell("A1").font = { bold: true, color: { argb: WHITE }, size: 18 };
  readme.getCell("A1").alignment = { vertical: "middle" };
  readme.getRow(1).height = 38;
  readme.addRow([]);
  readme.addRow(["Regla", "Instrucción"]);
  styleHeader(readme.getRow(3));
  const instructions = [
    ["Uso", "Completa únicamente la hoja Inventario. No cambies los encabezados de la fila 1."],
    ["SKU", "ExistingSKU solo identifica un producto que ya existe en JombuBox. Déjalo vacío para que el sistema genere el SKU."],
    ["CRÍTICO", "No escribas códigos J1B# en ExistingSKU. Esos códigos legacy representan ubicación física, nunca el SKU de un producto."],
    ["Fechas", "Esta plantilla usa ISO YYYY-MM-DD. El importador legacy también reconoce DD/MM/YYYY con convención día/mes de México."],
    ["Cantidad", "Quantity debe ser un entero mayor que cero. Si se omite, el previsualizador aplicará el valor predeterminado y mostrará una advertencia."],
    ["Catálogos", "Usa las listas de Brand, ComponentType, Condition, InventoryStatus, Currency, LocationCode e IsPublic."],
    ["Ubicación", "Usa LocationCode para enlazar una ubicación actual. BoxCode se conserva para compatibilidad con archivos anteriores."],
    ["Dinero", "SalePrice y PurchaseCost aceptan números no negativos con hasta dos decimales. Currency usa tres letras, por ejemplo MXN."],
    ["Coincidencias", "El sistema busca ExistingSKU y después parte/modelo normalizados. Las coincidencias posibles requieren revisión manual."],
    ["Seguridad", "La previsualización no crea productos ni inventario. El servidor vuelve a leer y validar el mismo archivo al confirmar."],
    ["Límites", "Máximo 2,000 filas, 5 hojas, 64 columnas y 8 MB comprimidos por archivo XLSX."],
    ["Campos", templateInventoryHeaders.join(", ")],
  ];
  instructions.forEach(([label, detail]) => readme.addRow([label, detail]));
  readme.eachRow((row, rowNumber) => {
    if (rowNumber > 3) {
      row.alignment = { vertical: "top", wrapText: true };
      row.getCell(1).font = { bold: true, color: { argb: HEADER_FILL } };
      row.height = 36;
    }
  });

  return workbook.xlsx.writeBuffer();
}
