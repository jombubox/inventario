import "server-only";

import ExcelJS from "exceljs";
import { asc, count, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  brands,
  componentTypes,
  inventoryItems,
  locations,
  products,
} from "@/db/schema";
import {
  safeOptionalSpreadsheetText,
  safeSpreadsheetText,
} from "@/features/exports/domain/spreadsheet-safety";
import { buildLocationBreadcrumb } from "@/features/locations/domain/location-hierarchy";
import { InvalidOperationError } from "@/features/shared/domain/service-errors";

export const MAX_INVENTORY_EXPORT_ROWS = 20_000;
const MAX_PRODUCT_EXPORT_ROWS = 20_000;
const MAX_LOCATION_EXPORT_ROWS = 5_000;
const NAVY = "FF000F30";
const BLUE = "FF2F73F2";
const LIGHT_BLUE = "FFE9F3FF";
const WHITE = "FFFFFFFF";

type ExportWorksheet = ExcelJS.Worksheet;

function styleHeader(sheet: ExportWorksheet, columns: number): void {
  const header = sheet.getRow(1);
  header.height = 30;
  for (let index = 1; index <= columns; index += 1) {
    const cell = header.getCell(index);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: BLUE } } };
  }
}

function prepareDataSheet(
  sheet: ExportWorksheet,
  headers: readonly string[],
  widths: readonly number[],
): void {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.properties.defaultRowHeight = 21;
  sheet.addRow(headers);
  styleHeader(sheet, headers.length);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function compatibilityExpression() {
  return sql<string>`coalesce((
    select string_agg(cb.name || ' ' || pc.model, ' | ' order by cb.name, pc.model)
    from product_compatibilities pc
    join brands cb on cb.id = pc.brand_id
    where pc.product_id = ${products.id}
  ), '')`;
}

export function inventoryExportFilename(now = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `JombuBox_Inventario_${date}.xlsx`;
}

export async function buildInventoryExport(db: Database, now = new Date()) {
  const [inventoryCount, productCount, locationCount] = await Promise.all([
    db.select({ value: count() }).from(inventoryItems),
    db.select({ value: count() }).from(products),
    db.select({ value: count() }).from(locations),
  ]);
  const counts = {
    inventory: inventoryCount[0]?.value ?? 0,
    products: productCount[0]?.value ?? 0,
    locations: locationCount[0]?.value ?? 0,
  };
  if (
    counts.inventory > MAX_INVENTORY_EXPORT_ROWS ||
    counts.products > MAX_PRODUCT_EXPORT_ROWS ||
    counts.locations > MAX_LOCATION_EXPORT_ROWS
  ) {
    throw new InvalidOperationError(
      "El inventario supera el límite operativo del export. Genera un respaldo lógico o divide la extracción.",
    );
  }

  const [inventoryRows, productRows, locationRows] = await Promise.all([
    db
      .select({
        inventoryCode: inventoryItems.inventoryCode,
        sku: products.sku,
        brand: brands.name,
        componentType: componentTypes.name,
        partNumber: products.partNumber,
        compatibleModels: compatibilityExpression(),
        title: products.title,
        quantity: inventoryItems.quantity,
        condition: inventoryItems.condition,
        inventoryStatus: inventoryItems.status,
        salePrice: products.salePrice,
        currency: products.currency,
        acquiredAt: inventoryItems.acquiredAt,
        acquisitionSource: inventoryItems.acquisitionSource,
        purchaseCost: inventoryItems.purchaseCost,
        locationId: inventoryItems.locationId,
        locationCode: locations.code,
        legacyBagNumber: inventoryItems.legacyBagNumber,
        legacyLocationCode: inventoryItems.legacyLocationCode,
        isPublic: products.isPublic,
        notes: inventoryItems.notes,
        updatedAt: inventoryItems.updatedAt,
      })
      .from(inventoryItems)
      .innerJoin(products, eq(inventoryItems.productId, products.id))
      .innerJoin(brands, eq(products.brandId, brands.id))
      .innerJoin(componentTypes, eq(products.componentTypeId, componentTypes.id))
      .leftJoin(locations, eq(inventoryItems.locationId, locations.id))
      .orderBy(asc(inventoryItems.inventoryCode))
      .limit(MAX_INVENTORY_EXPORT_ROWS),
    db
      .select({
        sku: products.sku,
        title: products.title,
        brand: brands.name,
        componentType: componentTypes.name,
        partNumber: products.partNumber,
        compatibleModels: compatibilityExpression(),
        salePrice: products.salePrice,
        currency: products.currency,
        status: products.status,
        isPublic: products.isPublic,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .innerJoin(componentTypes, eq(products.componentTypeId, componentTypes.id))
      .orderBy(asc(products.sku))
      .limit(MAX_PRODUCT_EXPORT_ROWS),
    db
      .select({
        id: locations.id,
        code: locations.code,
        name: locations.name,
        type: locations.type,
        parentId: locations.parentId,
        active: locations.active,
        notes: locations.notes,
        updatedAt: locations.updatedAt,
      })
      .from(locations)
      .orderBy(asc(locations.code))
      .limit(MAX_LOCATION_EXPORT_ROWS),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JombuBox";
  workbook.company = "JombuBox";
  workbook.subject = "Export operativo de inventario";
  workbook.created = now;
  workbook.modified = now;

  const inventory = workbook.addWorksheet("Inventario");
  const inventoryHeaders = [
    "InventoryCode",
    "SKU",
    "Brand",
    "ComponentType",
    "PartNumber",
    "CompatibleModels",
    "Title",
    "Quantity",
    "Condition",
    "InventoryStatus",
    "SalePrice",
    "Currency",
    "AcquiredAt",
    "AcquisitionSource",
    "PurchaseCost",
    "LocationCode",
    "LocationBreadcrumb",
    "LegacyBagNumber",
    "LegacyLocationCode",
    "IsPublic",
    "Notes",
    "UpdatedAt",
  ] as const;
  prepareDataSheet(
    inventory,
    inventoryHeaders,
    [18, 24, 18, 20, 22, 38, 40, 11, 20, 20, 16, 11, 14, 24, 16, 18, 42, 18, 22, 12, 42, 21],
  );
  for (const row of inventoryRows) {
    inventory.addRow([
      row.inventoryCode,
      row.sku,
      safeSpreadsheetText(row.brand),
      safeSpreadsheetText(row.componentType),
      safeOptionalSpreadsheetText(row.partNumber),
      safeSpreadsheetText(row.compatibleModels),
      safeSpreadsheetText(row.title),
      row.quantity,
      row.condition,
      row.inventoryStatus,
      row.salePrice === null ? null : Number(row.salePrice),
      row.currency,
      row.acquiredAt,
      safeOptionalSpreadsheetText(row.acquisitionSource),
      row.purchaseCost === null ? null : Number(row.purchaseCost),
      safeOptionalSpreadsheetText(row.locationCode),
      row.locationId
        ? safeSpreadsheetText(buildLocationBreadcrumb(row.locationId, locationRows))
        : null,
      safeOptionalSpreadsheetText(row.legacyBagNumber),
      safeOptionalSpreadsheetText(row.legacyLocationCode),
      row.isPublic,
      safeOptionalSpreadsheetText(row.notes),
      row.updatedAt,
    ]);
  }
  inventory.getColumn(8).numFmt = "#,##0";
  inventory.getColumn(11).numFmt = '"$"#,##0.00';
  inventory.getColumn(13).numFmt = "yyyy-mm-dd";
  inventory.getColumn(15).numFmt = '"$"#,##0.00';
  inventory.getColumn(22).numFmt = "yyyy-mm-dd hh:mm";

  const productSheet = workbook.addWorksheet("Productos");
  const productHeaders = [
    "SKU",
    "Title",
    "Brand",
    "ComponentType",
    "PartNumber",
    "CompatibleModels",
    "SalePrice",
    "Currency",
    "Status",
    "IsPublic",
    "CreatedAt",
    "UpdatedAt",
  ] as const;
  prepareDataSheet(productSheet, productHeaders, [24, 42, 18, 20, 22, 42, 16, 11, 16, 12, 21, 21]);
  productRows.forEach((row) => {
    productSheet.addRow([
      row.sku,
      safeSpreadsheetText(row.title),
      safeSpreadsheetText(row.brand),
      safeSpreadsheetText(row.componentType),
      safeOptionalSpreadsheetText(row.partNumber),
      safeSpreadsheetText(row.compatibleModels),
      row.salePrice === null ? null : Number(row.salePrice),
      row.currency,
      row.status,
      row.isPublic,
      row.createdAt,
      row.updatedAt,
    ]);
  });
  productSheet.getColumn(7).numFmt = '"$"#,##0.00';
  productSheet.getColumn(11).numFmt = "yyyy-mm-dd hh:mm";
  productSheet.getColumn(12).numFmt = "yyyy-mm-dd hh:mm";

  const locationSheet = workbook.addWorksheet("Ubicaciones");
  const locationHeaders = ["LocationCode", "Name", "Type", "Breadcrumb", "Active", "Notes", "UpdatedAt"] as const;
  prepareDataSheet(locationSheet, locationHeaders, [20, 28, 18, 52, 12, 42, 21]);
  locationRows.forEach((row) => {
    locationSheet.addRow([
      safeSpreadsheetText(row.code),
      safeSpreadsheetText(row.name),
      row.type,
      safeSpreadsheetText(buildLocationBreadcrumb(row.id, locationRows)),
      row.active,
      safeOptionalSpreadsheetText(row.notes),
      row.updatedAt,
    ]);
  });
  locationSheet.getColumn(7).numFmt = "yyyy-mm-dd hh:mm";

  const readme = workbook.addWorksheet("README", { views: [{ state: "frozen", ySplit: 3 }] });
  readme.getColumn(1).width = 28;
  readme.getColumn(2).width = 105;
  readme.mergeCells("A1:B1");
  readme.getCell("A1").value = "JombuBox · Export operativo de inventario";
  readme.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  readme.getCell("A1").font = { bold: true, color: { argb: WHITE }, size: 18 };
  readme.getCell("A1").alignment = { vertical: "middle" };
  readme.getRow(1).height = 38;
  readme.addRow([]);
  readme.addRow(["Concepto", "Detalle"]);
  styleHeader(readme, 2);
  const readmeRows = [
    ["Generado", now],
    ["Alcance", "Export interno autorizado para ADMIN y EDITOR."],
    ["Inventario", `${counts.inventory} registros físicos.`],
    ["Productos", `${counts.products} productos, incluidos borradores y archivados.`],
    ["Ubicaciones", `${counts.locations} ubicaciones operativas.`],
    ["Seguridad", "Los textos que podrían iniciar fórmulas se exportan como texto literal."],
    ["Límite", `Máximo ${MAX_INVENTORY_EXPORT_ROWS.toLocaleString("es-MX")} registros de inventario por archivo.`],
    ["Importante", "Este export facilita la operación, pero no sustituye un backup de PostgreSQL."],
  ];
  readmeRows.forEach((row) => readme.addRow(row));
  readme.getCell("B4").numFmt = "yyyy-mm-dd hh:mm";
  readme.eachRow((row, rowNumber) => {
    if (rowNumber <= 3) return;
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(1).font = { bold: true, color: { argb: NAVY } };
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
      });
    }
    row.height = 30;
  });

  const bytes = await workbook.xlsx.writeBuffer();
  return { bytes, counts, filename: inventoryExportFilename(now) };
}
