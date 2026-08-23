import "server-only";

import ExcelJS, { type CellValue, type Worksheet } from "exceljs";

import {
  importFieldValues,
  type ImportField,
  type ImportMapping,
  type RawImportRow,
} from "@/features/imports/domain/import-types";
import {
  MAX_XLSX_COLUMNS,
  MAX_XLSX_ROWS,
  MAX_XLSX_SHEETS,
} from "@/features/imports/domain/xlsx-security";
import { normalizeComparableText } from "@/features/shared/domain/text-normalization";

const headerAliases: Record<ImportField, readonly string[]> = {
  legacyBagNumber: ["LEGACYBAGNUMBER", "N BOLSA", "NO BOLSA", "NUMERO DE BOLSA", "BOLSA"],
  existingSku: ["EXISTINGSKU", "EXISTING SKU", "SKU EXISTENTE"],
  brand: ["BRAND", "MARCA"],
  compatibleModel: ["COMPATIBLEMODEL", "COMPATIBLE MODEL", "MODELO"],
  componentType: ["COMPONENTTYPE", "COMPONENT TYPE", "TARJETA", "TIPO"],
  partNumber: ["PARTNUMBER", "PART NUMBER", "NUMERO DE PARTE", "NO PARTE"],
  condition: ["CONDITION", "CONDICION"],
  quantity: ["QUANTITY", "CANTIDAD"],
  inventoryStatus: ["INVENTORYSTATUS", "INVENTORY STATUS", "ESTADO INVENTARIO"],
  salePrice: ["SALEPRICE", "SALE PRICE", "PRECIO DE VENTA"],
  currency: ["CURRENCY", "MONEDA"],
  acquiredAt: ["ACQUIREDAT", "ACQUIRED AT", "FECHA DE COMPRA", "FECHA COMPRA"],
  acquisitionSource: ["ACQUISITIONSOURCE", "ACQUISITION SOURCE", "DSC", "ORIGEN"],
  purchaseCost: ["PURCHASECOST", "PURCHASE COST", "COSTO", "COSTO DE COMPRA"],
  boxCode: ["BOXCODE", "BOX CODE", "CODIGO DE CAJA", "CAJA"],
  locationCode: ["LOCATIONCODE", "LOCATION CODE", "CODIGO DE UBICACION", "UBICACION"],
  isPublic: ["ISPUBLIC", "IS PUBLIC", "PUBLICO"],
  titleOverride: ["TITLEOVERRIDE", "TITLE OVERRIDE", "TITULO PERSONALIZADO"],
  description: ["DESCRIPTION", "DESCRIPCION"],
  internalNotes: ["INTERNALNOTES", "INTERNAL NOTES", "NOTAS INTERNAS", "NOTAS"],
  legacyTitle: ["LEGACYTITLE", "LEGACY TITLE", "TITULO"],
  legacyLocationCode: ["LEGACYLOCATIONCODE", "LEGACY LOCATION CODE", "SKU"],
  legacyExtra: ["LEGACYEXTRA", "LEGACY EXTRA", "ULTIMA COLUMNA"],
};

function normalizeHeader(value: string): string {
  return normalizeComparableText(value)
    .replace(/[°º#]/gu, " ")
    .replace(/[^A-Z0-9]+/gu, " ")
    .trim();
}

const normalizedAliasEntries = importFieldValues.flatMap((field) =>
  headerAliases[field].map((alias) => [normalizeHeader(alias), field] as const),
);

function cellValueToPrimitive(value: CellValue): string | number | boolean | Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object") {
    if ("result" in value) return cellValueToPrimitive(value.result as CellValue);
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return String(value.error);
  }
  return String(value);
}

function displayCellValue(value: CellValue): string {
  const primitive = cellValueToPrimitive(value);
  if (primitive === null) return "";
  if (primitive instanceof Date) return primitive.toISOString().slice(0, 10);
  return String(primitive).trim();
}

function headerScore(worksheet: Worksheet, rowNumber: number): number {
  const row = worksheet.getRow(rowNumber);
  let score = 0;
  for (let column = 1; column <= Math.min(row.cellCount, MAX_XLSX_COLUMNS); column += 1) {
    const normalized = normalizeHeader(displayCellValue(row.getCell(column).value));
    if (normalizedAliasEntries.some(([alias]) => alias === normalized)) score += 1;
  }
  return score;
}

function selectDataSheet(workbook: ExcelJS.Workbook): Worksheet {
  if (workbook.worksheets.length < 1 || workbook.worksheets.length > MAX_XLSX_SHEETS) {
    throw new Error(`El XLSX debe contener entre 1 y ${MAX_XLSX_SHEETS} hojas.`);
  }
  const named = workbook.worksheets.find(
    (sheet) => normalizeHeader(sheet.name) === "INVENTARIO",
  );
  if (named) return named;

  const ranked = workbook.worksheets
    .map((sheet) => ({
      sheet,
      score: Math.max(...Array.from({ length: Math.min(20, sheet.rowCount) }, (_, index) => headerScore(sheet, index + 1))),
    }))
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0];
  if (!selected || selected.score < 2) {
    throw new Error("No se encontró una hoja con encabezados reconocibles.");
  }
  return selected.sheet;
}

function detectHeaderRow(worksheet: Worksheet): number {
  let best = { row: 0, score: 0 };
  for (let row = 1; row <= Math.min(20, worksheet.rowCount); row += 1) {
    const score = headerScore(worksheet, row);
    if (score > best.score) best = { row, score };
  }
  if (best.score < 2) throw new Error("No se pudo detectar la fila de encabezados.");
  return best.row;
}

export function detectImportMapping(headers: readonly string[]): ImportMapping {
  const mapping: ImportMapping = {};
  const usedHeaders = new Set<string>();
  for (const field of importFieldValues) {
    const aliases = new Set(headerAliases[field].map(normalizeHeader));
    const match = headers.find(
      (header) => !usedHeaders.has(header) && aliases.has(normalizeHeader(header)),
    );
    if (match) {
      mapping[field] = match;
      usedHeaders.add(match);
    }
  }

  // The final unknown legacy column is deliberately not treated as cost. It is
  // retained as legacyExtra so the analyzer can apply a conservative heuristic.
  const remaining = headers.filter((header) => !usedHeaders.has(header));
  if (!mapping.legacyExtra && remaining.length === 1) mapping.legacyExtra = remaining[0];
  return mapping;
}

function validateMapping(headers: readonly string[], mapping: ImportMapping): void {
  const headerSet = new Set(headers);
  const used = new Set<string>();
  for (const [field, header] of Object.entries(mapping)) {
    if (!importFieldValues.includes(field as ImportField) || !headerSet.has(header)) {
      throw new Error("El mapeo contiene una columna o destino inválido.");
    }
    if (used.has(header)) throw new Error(`La columna “${header}” está mapeada dos veces.`);
    used.add(header);
  }
}

export async function parseXlsxWorkbook(
  bytes: Uint8Array,
  requestedMapping?: ImportMapping,
): Promise<{
  sheetName: string;
  headerRow: number;
  headers: string[];
  mapping: ImportMapping;
  rows: RawImportRow[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const worksheet = selectDataSheet(workbook);
  const headerRow = detectHeaderRow(worksheet);
  const row = worksheet.getRow(headerRow);
  const columnCount = Math.min(row.cellCount, worksheet.columnCount);
  if (columnCount < 1 || columnCount > MAX_XLSX_COLUMNS) {
    throw new Error(`La hoja debe tener entre 1 y ${MAX_XLSX_COLUMNS} columnas.`);
  }

  const headers: string[] = [];
  for (let column = 1; column <= columnCount; column += 1) {
    const value = displayCellValue(row.getCell(column).value) || `Columna ${column}`;
    headers.push(value);
  }
  if (new Set(headers.map(normalizeHeader)).size !== headers.length) {
    throw new Error("La hoja contiene encabezados duplicados.");
  }

  const mapping = requestedMapping ?? detectImportMapping(headers);
  validateMapping(headers, mapping);
  const sourceColumnByHeader = new Map(headers.map((header, index) => [header, index + 1]));
  const rows: RawImportRow[] = [];

  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const worksheetRow = worksheet.getRow(rowNumber);
    const values: RawImportRow["values"] = {};
    let hasValue = false;
    for (const field of importFieldValues) {
      const header = mapping[field];
      if (!header) continue;
      const column = sourceColumnByHeader.get(header);
      if (!column) continue;
      const value = cellValueToPrimitive(worksheetRow.getCell(column).value);
      if (value !== null && String(value).trim() !== "") hasValue = true;
      values[field] = value;
    }
    if (hasValue) rows.push({ rowNumber, values });
    if (rows.length > MAX_XLSX_ROWS) {
      throw new Error(`El archivo supera el máximo de ${MAX_XLSX_ROWS} filas de datos.`);
    }
  }

  if (rows.length === 0) throw new Error("La hoja no contiene filas de inventario.");
  return { sheetName: worksheet.name, headerRow, headers, mapping, rows };
}
