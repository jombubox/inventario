import { and, eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import type { Database } from "@/db/connection";
import { seedDatabase } from "@/db/seed";
import * as schema from "@/db/schema";
import {
  auditLogs,
  brands,
  componentTypes,
  inventoryMovements,
  inventoryItems,
  importJobs,
  importJobRows,
  operationalRateLimits,
  productImages,
  productSerialNumbers,
  products,
  locations,
} from "@/db/schema";
import {
  adjustInventoryQuantity,
  createInventoryItem,
  moveInventoryItem,
  recordStockMovement,
} from "@/features/inventory/server/inventory-service";
import {
  analyzeImportFile,
  confirmImportFile,
} from "@/features/imports/server/import-service";
import type { ImageStorage, R2PutObject } from "@/features/images/server/r2";
import {
  createProductImage,
  deleteProductImage,
  reorderProductImages,
  updateProductImage,
} from "@/features/images/server/image-service";
import {
  deleteBox,
  createLocation,
  updateLocation,
} from "@/features/locations/server/location-service";
import { quickAddInventory } from "@/features/inventory/server/quick-add-service";
import { searchInventoryModels } from "@/features/inventory/data/quick-add-queries";
import {
  archiveProduct,
  createProduct,
  updateProduct,
} from "@/features/products/server/product-service";
import { CUSTOM_CATALOG_VALUE } from "@/features/products/domain/catalog-selection";
import {
  DuplicateEntityError,
  InvalidOperationError,
  RateLimitExceededError,
} from "@/features/shared/domain/service-errors";
import { buildInventoryExport } from "@/features/exports/server/inventory-export";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";
import type { CreateProductMutationInput } from "@/validators/admin-product";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeLocalDatabase = (() => {
  if (!testDatabaseUrl) return false;
  const url = new URL(testDatabaseUrl);
  return ["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/jumbobox_test";
})();

describe.skipIf(!safeLocalDatabase).sequential("administrative services on PostgreSQL", () => {
  let pool: Pool;
  let nodeDb: NodePgDatabase<typeof schema>;
  let db: Database;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
    nodeDb = drizzle(pool, { schema });
    db = nodeDb as unknown as Database;
  });

  beforeEach(async () => {
    await pool.query(`
      truncate table
        inventory_movements, inventory_items, product_compatibilities, product_images,
        product_serial_numbers,
        products, locations, audit_logs, import_jobs, brand_aliases,
        component_type_aliases, brands, component_types, session, account,
        verification, rate_limit, operational_rate_limits, "user"
      restart identity cascade
    `);
    await pool.query("alter sequence inventory_code_seq restart with 1");
    await seedDatabase(nodeDb);
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function catalogIds() {
    const [brand, componentType] = await Promise.all([
      nodeDb.query.brands.findFirst({ where: eq(brands.code, "SAM") }),
      nodeDb.query.componentTypes.findFirst({ where: eq(componentTypes.code, "MB") }),
    ]);
    if (!brand || !componentType) throw new Error("Seed catalogs are missing.");
    return { brand, componentType };
  }

  async function createTestProduct(
    overrides: Partial<CreateProductMutationInput> = {},
  ) {
    const { brand, componentType } = await catalogIds();
    return createProduct(db, {
      brandId: brand.id,
      componentTypeId: componentType.id,
      partNumber: "BN94-07820F",
      title: null,
      description: "Producto de prueba",
      salePrice: "500.00",
      currency: "MXN",
      status: "ACTIVE",
      isPublic: true,
      compatibilities: [{ brandId: brand.id, model: "UN58H5200SXZX", notes: null }],
      ...overrides,
    });
  }

  it("creates, edits and archives a product without changing its SKU", async () => {
    const product = await createTestProduct();
    expect(product.sku).toBe("SAM-MB-BN9407820F");

    await expect(createTestProduct()).rejects.toBeInstanceOf(DuplicateEntityError);

    const { brand, componentType } = await catalogIds();
    await expect(
      updateProduct(db, {
        id: product.id,
        expectedUpdatedAt: product.updatedAt,
        brandId: brand.id,
        componentTypeId: componentType.id,
        partNumber: "BN94-07820F",
        title: null,
        description: null,
        salePrice: "500.00",
        currency: "MXN",
        status: "ACTIVE",
        isPublic: true,
        compatibilities: [
          { brandId: brand.id, model: "UN58H5200SXZX", notes: null },
          { brandId: brand.id, model: "un58h5200sxzx", notes: null },
        ],
      }),
    ).rejects.toBeInstanceOf(DuplicateEntityError);

    const updated = await updateProduct(db, {
      id: product.id,
      expectedUpdatedAt: product.updatedAt,
      brandId: brand.id,
      componentTypeId: componentType.id,
      partNumber: "BN94-07820G",
      title: "Título administrado",
      description: null,
      salePrice: "550.00",
      currency: "MXN",
      status: "ACTIVE",
      isPublic: true,
      compatibilities: [{ brandId: brand.id, model: "UN58H5203AFXZA", notes: null }],
    });
    expect(updated.sku).toBe(product.sku);

    const archived = await archiveProduct(db, {
      id: product.id,
      expectedUpdatedAt: updated.updatedAt,
    });
    expect(archived).toMatchObject({ status: "ARCHIVED", isPublic: false });
    const actions = await nodeDb.select({ action: auditLogs.action }).from(auditLogs);
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining(["PRODUCT_CREATED", "PRODUCT_UPDATED", "PRODUCT_ARCHIVED"]),
    );
    expect(await nodeDb.select().from(schema.user)).toHaveLength(0);
    const attribution = await nodeDb
      .select({ userId: auditLogs.userId, metadata: auditLogs.metadata })
      .from(auditLogs);
    expect(attribution).not.toHaveLength(0);
    expect(attribution.every(({ userId }) => userId === null)).toBe(true);
    expect(attribution.every(({ metadata }) => metadata?.actorId === undefined)).toBe(true);
  });

  it("persists optional model serial combinations without changing part-number or SKU semantics", async () => {
    const withoutSerials = await createTestProduct({ partNumber: "SERIAL-CASE-0" });
    const primaryOnly = await createTestProduct({
      partNumber: "SERIAL-CASE-1",
      primarySerialNumber: "  MAIN-ONE  ",
    });
    const primaryAndOne = await createTestProduct({
      partNumber: "SERIAL-CASE-2",
      primarySerialNumber: "MAIN-TWO",
      secondarySerialNumbers: ["ALT-TWO"],
    });
    const primaryAndMany = await createTestProduct({
      partNumber: "SERIAL-CASE-3",
      primarySerialNumber: "MAIN-THREE",
      secondarySerialNumbers: ["ALT-THREE-A", "ALT-THREE-B", "ALT-THREE-C"],
    });
    const secondaryOnly = await createTestProduct({
      partNumber: "SERIAL-CASE-4",
      secondarySerialNumbers: ["ONLY-ALT"],
    });

    expect(
      await nodeDb
        .select()
        .from(productSerialNumbers)
        .where(eq(productSerialNumbers.productId, withoutSerials.id)),
    ).toHaveLength(0);
    expect(
      await nodeDb
        .select()
        .from(productSerialNumbers)
        .where(eq(productSerialNumbers.productId, primaryOnly.id)),
    ).toEqual([
      expect.objectContaining({
        kind: "PRIMARY",
        serialNumber: "MAIN-ONE",
        normalizedSerialNumber: "MAIN-ONE",
      }),
    ]);
    expect(
      await nodeDb
        .select()
        .from(productSerialNumbers)
        .where(eq(productSerialNumbers.productId, primaryAndOne.id)),
    ).toHaveLength(2);
    expect(
      await nodeDb
        .select()
        .from(productSerialNumbers)
        .where(eq(productSerialNumbers.productId, primaryAndMany.id)),
    ).toHaveLength(4);
    expect(
      await nodeDb
        .select()
        .from(productSerialNumbers)
        .where(eq(productSerialNumbers.productId, secondaryOnly.id)),
    ).toEqual([expect.objectContaining({ kind: "SECONDARY", serialNumber: "ONLY-ALT" })]);

    expect(primaryOnly.sku).toBe("SAM-MB-SERIALCASE1");
    expect(primaryOnly.partNumber).toBe("SERIAL-CASE-1");
  });

  it("edits and removes model serials while preserving SKU and supports every search identity", async () => {
    const product = await createTestProduct({
      partNumber: "SERIAL-EDIT-1",
      primarySerialNumber: "SEARCH-MAIN-OLD",
      secondarySerialNumbers: ["SEARCH-REMOVE", "SEARCH-KEEP"],
    });
    const { brand, componentType } = await catalogIds();
    const updated = await updateProduct(db, {
      id: product.id,
      expectedUpdatedAt: product.updatedAt,
      brandId: brand.id,
      componentTypeId: componentType.id,
      partNumber: product.partNumber,
      primarySerialNumber: " SEARCH-MAIN-NEW ",
      secondarySerialNumbers: [" SEARCH-KEEP ", "SEARCH-ADDED"],
      title: product.title,
      description: product.description,
      salePrice: product.salePrice,
      currency: product.currency,
      status: product.status,
      isPublic: product.isPublic,
      compatibilities: [],
    });

    expect(updated.sku).toBe(product.sku);
    expect(
      await nodeDb
        .select({ kind: productSerialNumbers.kind, value: productSerialNumbers.serialNumber })
        .from(productSerialNumbers)
        .where(eq(productSerialNumbers.productId, product.id)),
    ).toEqual(
      expect.arrayContaining([
        { kind: "PRIMARY", value: "SEARCH-MAIN-NEW" },
        { kind: "SECONDARY", value: "SEARCH-KEEP" },
        { kind: "SECONDARY", value: "SEARCH-ADDED" },
      ]),
    );
    expect(
      await nodeDb
        .select()
        .from(productSerialNumbers)
        .where(
          and(
            eq(productSerialNumbers.productId, product.id),
            eq(productSerialNumbers.serialNumber, "SEARCH-REMOVE"),
          ),
        ),
    ).toHaveLength(0);

    for (const query of ["SEARCH-MAIN-NEW", "SEARCH-ADDED", "SERIAL-EDIT-1"]) {
      expect((await searchInventoryModels(db, query)).map(({ id }) => id)).toContain(product.id);
    }
    expect(await searchInventoryModels(db, "SEARCH-MAIN-OLD")).toHaveLength(0);
  });

  it("rejects duplicate serials in the service and in database constraints without global uniqueness", async () => {
    await expect(
      createTestProduct({
        partNumber: "SERIAL-DUP-1",
        primarySerialNumber: "ABC-123",
        secondarySerialNumbers: [" abc-123 "],
      }),
    ).rejects.toBeInstanceOf(InvalidOperationError);
    expect(
      await nodeDb.select().from(products).where(eq(products.partNumber, "SERIAL-DUP-1")),
    ).toHaveLength(0);

    await expect(
      createTestProduct({
        partNumber: "SERIAL-DUP-2",
        secondarySerialNumbers: ["XYZ-9", "xyz-9"],
      }),
    ).rejects.toBeInstanceOf(InvalidOperationError);

    const first = await createTestProduct({
      partNumber: "SERIAL-DB-1",
      primarySerialNumber: "SHARED-SERIAL",
    });
    const second = await createTestProduct({
      partNumber: "SERIAL-DB-2",
      secondarySerialNumbers: ["SHARED-SERIAL"],
    });
    expect(first.id).not.toBe(second.id);

    await expect(
      nodeDb.insert(productSerialNumbers).values({
        productId: first.id,
        kind: "SECONDARY",
        serialNumber: "shared-serial",
        normalizedSerialNumber: "SHARED-SERIAL",
        sortOrder: 1,
      }),
    ).rejects.toThrow();
    await expect(
      nodeDb.insert(productSerialNumbers).values({
        productId: first.id,
        kind: "PRIMARY",
        serialNumber: "ANOTHER-PRIMARY",
        normalizedSerialNumber: "ANOTHER-PRIMARY",
        sortOrder: 0,
      }),
    ).rejects.toThrow();
  });

  it("serializes concurrent product identity allocation", async () => {
    const attempts = await Promise.allSettled([createTestProduct(), createTestProduct()]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(DuplicateEntityError) });
    expect(await nodeDb.select().from(schema.products)).toHaveLength(1);
  });

  it("creates and reuses custom brand and component catalogs transactionally", async () => {
    const first = await createProduct(db, {
      brandId: CUSTOM_CATALOG_VALUE,
      customBrandName: "  Marca Ñueva  ",
      componentTypeId: CUSTOM_CATALOG_VALUE,
      customComponentTypeName: "  Módulo   especial  ",
      partNumber: "CUSTOM-001",
      title: null,
      description: null,
      salePrice: null,
      currency: "MXN",
      status: "DRAFT",
      isPublic: false,
      compatibilities: [],
    });
    const second = await createProduct(db, {
      brandId: CUSTOM_CATALOG_VALUE,
      customBrandName: "marca nueva",
      componentTypeId: CUSTOM_CATALOG_VALUE,
      customComponentTypeName: "MÓDULO ESPECIAL",
      partNumber: "CUSTOM-002",
      title: null,
      description: null,
      salePrice: null,
      currency: "MXN",
      status: "DRAFT",
      isPublic: false,
      compatibilities: [],
    });

    expect(second.brandId).toBe(first.brandId);
    expect(second.componentTypeId).toBe(first.componentTypeId);
    expect(await nodeDb.select().from(brands).where(eq(brands.id, first.brandId))).toEqual([
      expect.objectContaining({ name: "Marca Ñueva", normalizedName: "MARCA NUEVA" }),
    ]);
    expect(
      await nodeDb.select().from(componentTypes).where(eq(componentTypes.id, first.componentTypeId)),
    ).toEqual([
      expect.objectContaining({ name: "Módulo especial", normalizedName: "MODULO ESPECIAL" }),
    ]);

    const seeded = await catalogIds();
    const existingCatalogProduct = await createProduct(db, {
      brandId: CUSTOM_CATALOG_VALUE,
      customBrandName: "  samsung ",
      componentTypeId: CUSTOM_CATALOG_VALUE,
      customComponentTypeName: " MAINBOARD ",
      partNumber: "CUSTOM-EXISTING-001",
      title: null,
      description: null,
      salePrice: null,
      currency: "MXN",
      status: "DRAFT",
      isPublic: false,
      compatibilities: [],
    });
    expect(existingCatalogProduct.brandId).toBe(seeded.brand.id);
    expect(existingCatalogProduct.componentTypeId).toBe(seeded.componentType.id);

    const [hisense, tCon] = await Promise.all([
      nodeDb.query.brands.findFirst({ where: eq(brands.normalizedName, "HISENSE") }),
      nodeDb.query.componentTypes.findFirst({
        where: eq(componentTypes.normalizedName, "T-CON"),
      }),
    ]);
    if (!hisense || !tCon) throw new Error("Alias targets are missing.");
    const aliasCatalogProduct = await createProduct(db, {
      brandId: CUSTOM_CATALOG_VALUE,
      customBrandName: "hissense",
      componentTypeId: CUSTOM_CATALOG_VALUE,
      customComponentTypeName: "t-com",
      partNumber: "CUSTOM-ALIAS-001",
      title: null,
      description: null,
      salePrice: null,
      currency: "MXN",
      status: "DRAFT",
      isPublic: false,
      compatibilities: [],
    });
    expect(aliasCatalogProduct.brandId).toBe(hisense.id);
    expect(aliasCatalogProduct.componentTypeId).toBe(tCon.id);

    const updated = await updateProduct(db, {
      id: first.id,
      expectedUpdatedAt: first.updatedAt,
      brandId: CUSTOM_CATALOG_VALUE,
      customBrandName: "MARCA NUEVA",
      componentTypeId: CUSTOM_CATALOG_VALUE,
      customComponentTypeName: "módulo especial",
      partNumber: first.partNumber,
      title: first.title,
      description: first.description,
      salePrice: first.salePrice,
      currency: first.currency,
      status: first.status,
      isPublic: first.isPublic,
      compatibilities: [],
    });
    expect(updated.brandId).toBe(first.brandId);
    expect(updated.componentTypeId).toBe(first.componentTypeId);
    expect(updated.sku).toBe(first.sku);

    await expect(
      createProduct(db, {
        brandId: CUSTOM_CATALOG_VALUE,
        customBrandName: "Catálogo que debe revertirse",
        componentTypeId: CUSTOM_CATALOG_VALUE,
        customComponentTypeName: "Componente que debe revertirse",
        partNumber: null,
        title: null,
        description: null,
        salePrice: null,
        currency: "MXN",
        status: "DRAFT",
        isPublic: false,
        compatibilities: [],
      }),
    ).rejects.toThrow();
    expect(
      await nodeDb
        .select()
        .from(brands)
        .where(eq(brands.normalizedName, "CATALOGO QUE DEBE REVERTIRSE")),
    ).toHaveLength(0);
    expect(
      await nodeDb
        .select()
        .from(componentTypes)
        .where(eq(componentTypes.normalizedName, "COMPONENTE QUE DEBE REVERTIRSE")),
    ).toHaveLength(0);
  });

  it("creates inventory, generates its code, moves it and adjusts stock atomically", async () => {
    const product = await createTestProduct();
    const warehouse = await createLocation(db, {
      code: "WH-01",
      name: "Almacén",
      type: "WAREHOUSE",
      parentId: null,
      active: true,
      notes: null,
    });
    const box = await createLocation(db, {
      code: "C03",
      name: "Caja 03",
      type: "BOX",
      parentId: warehouse.id,
      active: true,
      notes: null,
    });
    const item = await createInventoryItem(db, {
      productId: product.id,
      locationId: warehouse.id,
      quantity: 3,
      condition: "UNKNOWN",
      status: "AVAILABLE",
      acquiredAt: null,
      acquisitionSource: null,
      purchaseCost: null,
      notes: null,
      legacyBagNumber: null,
      legacyLocationCode: "J1B1",
    });
    expect(item.inventoryCode).toBe("INV-000001");

    const moved = await moveInventoryItem(db, {
      id: item.id,
      toLocationId: box.id,
      reason: "Reorganización",
    });
    expect(moved.locationId).toBe(box.id);
    await expect(
      moveInventoryItem(db, {
        id: item.id,
        toLocationId: box.id,
        reason: "Movimiento repetido",
      }),
    ).rejects.toBeInstanceOf(InvalidOperationError);

    const adjusted = await adjustInventoryQuantity(db, {
      id: item.id,
      newQuantity: 5,
      newStatus: "AVAILABLE",
      reason: "Conteo físico",
    });
    expect(adjusted.quantity).toBe(5);
    const movements = await nodeDb
      .select({ type: inventoryMovements.type })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.inventoryItemId, item.id));
    expect(movements.map(({ type }) => type)).toEqual(["INITIAL", "MOVE", "ADJUSTMENT"]);
    const audits = await nodeDb
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(
        inArray(auditLogs.action, [
          "INVENTORY_CREATED",
          "INVENTORY_MOVED",
          "INVENTORY_ADJUSTED",
        ]),
      );
    expect(audits).toHaveLength(3);

    const entered = await recordStockMovement(db, {
      id: item.id,
      type: "IN",
      quantity: 2,
      resultingStatus: "AVAILABLE",
      reason: "Compra adicional",
    });
    expect(entered.quantity).toBe(7);
    const partialOut = await recordStockMovement(db, {
      id: item.id,
      type: "OUT",
      quantity: 3,
      resultingStatus: "SCRAPPED",
      reason: "Salida a diagnóstico",
    });
    expect(partialOut).toMatchObject({ quantity: 4, status: "AVAILABLE" });
    const sold = await recordStockMovement(db, {
      id: item.id,
      type: "SALE",
      quantity: 4,
      resultingStatus: "SOLD",
      reason: "Venta mostrador",
    });
    expect(sold).toMatchObject({ quantity: 0, status: "SOLD" });
    await expect(recordStockMovement(db, {
      id: item.id,
      type: "OUT",
      quantity: 1,
      resultingStatus: "SCRAPPED",
      reason: "Salida imposible",
    })).rejects.toBeInstanceOf(InvalidOperationError);
    const returned = await recordStockMovement(db, {
      id: item.id,
      type: "RETURN",
      quantity: 1,
      resultingStatus: "AVAILABLE",
      reason: "Devolución de cliente",
    });
    expect(returned).toMatchObject({ quantity: 1, status: "AVAILABLE" });
    const domainMovements = await nodeDb.select({ type: inventoryMovements.type }).from(inventoryMovements).where(eq(inventoryMovements.inventoryItemId, item.id));
    expect(domainMovements.map(({ type }) => type)).toEqual(["INITIAL", "MOVE", "ADJUSTMENT", "IN", "OUT", "SALE", "RETURN"]);
  });

  it("prevents overselling when two stock exits race", async () => {
    const product = await createTestProduct();
    const item = await createInventoryItem(db, {
      productId: product.id,
      locationId: null,
      quantity: 1,
      condition: "UNKNOWN",
      status: "AVAILABLE",
      acquiredAt: null,
      acquisitionSource: null,
      purchaseCost: null,
      notes: null,
      legacyBagNumber: null,
      legacyLocationCode: null,
    });

    const attempts = await Promise.allSettled([
      recordStockMovement(db, { id: item.id, type: "SALE", quantity: 1, resultingStatus: "SOLD", reason: "Venta A" }),
      recordStockMovement(db, { id: item.id, type: "SALE", quantity: 1, resultingStatus: "SOLD", reason: "Venta B" }),
    ]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await nodeDb.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, item.id) })).toMatchObject({ quantity: 0, status: "SOLD" });
    const sales = await nodeDb.select().from(inventoryMovements).where(and(eq(inventoryMovements.inventoryItemId, item.id), eq(inventoryMovements.type, "SALE")));
    expect(sales).toHaveLength(1);
  });

  it("builds a four-sheet protected XLSX export with typed values", async () => {
    const product = await createTestProduct();
    await nodeDb.update(schema.products).set({ title: "=HYPERLINK(\"https://example.test\")" }).where(eq(schema.products.id, product.id));
    await createInventoryItem(db, {
      productId: product.id,
      locationId: null,
      quantity: 2,
      condition: "USED_GOOD",
      status: "AVAILABLE",
      acquiredAt: new Date("2026-08-01T12:00:00Z"),
      acquisitionSource: "+external",
      purchaseCost: "100.00",
      notes: "@SUM(A1:A2)",
      legacyBagNumber: null,
      legacyLocationCode: null,
    });

    const result = await buildInventoryExport(db, new Date("2026-08-12T18:00:00Z"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.bytes);
    expect(workbook.worksheets.map(({ name }) => name)).toEqual(["Inventario", "Productos", "Ubicaciones", "README"]);
    const inventorySheet = workbook.getWorksheet("Inventario")!;
    expect(inventorySheet.getCell("G2").value).toBe("'=HYPERLINK(\"https://example.test\")");
    expect(inventorySheet.getCell("N2").value).toBe("'+external");
    expect(inventorySheet.getCell("U2").value).toBe("'@SUM(A1:A2)");
    expect(inventorySheet.getCell("H2").value).toBe(2);
    expect(inventorySheet.getCell("M2").value).toBeInstanceOf(Date);
    expect(result.filename).toBe("JombuBox_Inventario_2026-08-12.xlsx");
  });

  it("enforces operational rate limits atomically", async () => {
    await consumeOperationalRateLimit(db, { scope: "test", identity: "admin", limit: 1, windowSeconds: 60 });
    await expect(consumeOperationalRateLimit(db, { scope: "test", identity: "admin", limit: 1, windowSeconds: 60 })).rejects.toBeInstanceOf(RateLimitExceededError);
    expect(await nodeDb.select().from(operationalRateLimits)).toHaveLength(1);
  });

  it("imports a legacy workbook, preserves J1B# as location metadata and blocks accidental reimport", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Legacy");
    sheet.addRow(["N° Bolsa", "Marca", "Modelo", "Tarjeta", "SKU", "Número de Parte", "Título", "FECHA DE COMPRA", "DSC"]);
    sheet.addRow(["0042", "HISSENSE", "50H5G", "T-COM", "J1B7", "RSAG7.820.123", "Título heredado", "31/01/2025", "Compra legacy"]);
    const file = new File([await workbook.xlsx.writeBuffer()], "Humeberto.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const defaults = { condition: "UNKNOWN", inventoryStatus: "AVAILABLE", currency: "MXN", isPublic: false } as const;
    const preview = await analyzeImportFile(db, { file, defaults });
    expect(preview.rows[0]).toMatchObject({
      status: "WARNING",
      importable: true,
      normalized: {
        brandName: "Hisense",
        componentTypeName: "T-Con",
        legacyLocationCode: "J1B7",
        existingSku: null,
      },
    });
    expect(preview.rows[0]?.normalized.proposedSku).not.toContain("J1B7");

    const completed = await confirmImportFile(db, {
      file,
      jobId: preview.jobId,
      mapping: preview.mapping,
      defaults,
      corrections: {},
      forceDuplicateFile: false,
      includeDuplicateRows: false,
      includePreviouslyImported: false,
    });
    expect(completed).toMatchObject({ productsCreated: 1, inventoryItemsCreated: 1 });
    const importedProduct = await nodeDb.query.products.findFirst({ where: eq(schema.products.sku, preview.rows[0]!.normalized.proposedSku!) });
    expect(importedProduct?.sku).not.toMatch(/^J1B/u);
    const importedInventory = await nodeDb.query.inventoryItems.findFirst({ where: eq(inventoryItems.productId, importedProduct!.id) });
    expect(importedInventory).toMatchObject({ legacyBagNumber: "0042", legacyLocationCode: "J1B7" });
    expect(await nodeDb.query.importJobRows.findFirst({ where: eq(importJobRows.importJobId, preview.jobId) })).toMatchObject({ status: "IMPORTED" });

    const duplicatePreview = await analyzeImportFile(db, { file, defaults });
    expect(duplicatePreview.duplicateFile).toBe(true);
    await expect(confirmImportFile(db, {
      file,
      jobId: duplicatePreview.jobId,
      mapping: duplicatePreview.mapping,
      defaults,
      corrections: {},
      forceDuplicateFile: false,
      includeDuplicateRows: false,
      includePreviouslyImported: false,
    })).rejects.toBeInstanceOf(InvalidOperationError);
    expect(await nodeDb.select().from(importJobs)).toHaveLength(2);
  });

  it("registers, orders, promotes and deletes R2 images through fake storage", async () => {
    const product = await createTestProduct();
    const objects = new Map<string, R2PutObject>();
    const deleted: string[] = [];
    const storage: ImageStorage = {
      async putObject(input) {
        objects.set(input.objectKey, input);
      },
      async deleteObject(objectKey) {
        deleted.push(objectKey);
        objects.delete(objectKey);
      },
    };
    const first = await createProductImage(db, storage, {
      productId: product.id,
      filename: "frente.jpg",
      mimeType: "image/jpeg",
      bytes: Buffer.from("ffd8ffe00000000000000000", "hex"),
      alt: "Vista frontal",
    });
    const second = await createProductImage(db, storage, {
      productId: product.id,
      filename: "reverso.png",
      mimeType: "image/png",
      bytes: Buffer.from("89504e470d0a1a0a00000000", "hex"),
      alt: "Vista trasera",
    });
    expect(first.isPrimary).toBe(true);
    expect(second.isPrimary).toBe(false);
    expect(first).toMatchObject({ provider: "CLOUDFLARE_R2", externalId: null, url: null });
    expect(first.storageKey).toMatch(/^products\/SAM-MB-[A-Z0-9-]+\/[0-9a-f-]{36}\.jpg$/u);
    expect(objects.size).toBe(2);

    await updateProductImage(db, { imageId: second.id, makePrimary: true, alt: "Parte posterior" });
    await reorderProductImages(db, product.id, [second.id, first.id]);
    await deleteProductImage(db, storage, second.id);
    const remaining = await nodeDb.select().from(productImages).where(eq(productImages.productId, product.id));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: first.id, isPrimary: true, sortOrder: 0 });
    expect(deleted).toEqual([second.storageKey]);
    expect(objects.has(second.storageKey!)).toBe(false);
  });

  it("creates and edits locations while rejecting self-parent and cycles", async () => {
    const root = await createLocation(db, {
      code: "WH-01",
      name: "Almacén",
      type: "WAREHOUSE",
      parentId: null,
      active: true,
      notes: null,
    });
    const child = await createLocation(db, {
      code: "J1",
      name: "Estante J1",
      type: "SHELF",
      parentId: root.id,
      active: true,
      notes: null,
    });
    await expect(
      updateLocation(db, {
        id: root.id,
        expectedUpdatedAt: root.updatedAt,
        code: root.code,
        name: root.name,
        type: root.type,
        parentId: child.id,
        active: true,
        notes: null,
      }),
    ).rejects.toThrow(/cycle/u);
    await expect(
      updateLocation(db, {
        id: child.id,
        expectedUpdatedAt: child.updatedAt,
        code: child.code,
        name: child.name,
        type: child.type,
        parentId: child.id,
        active: true,
        notes: null,
      }),
    ).rejects.toThrow(/cycle/u);
  });

  it("adds stock to an existing model with and without an optional bag", async () => {
    const product = await createTestProduct();
    const warehouse = await createLocation(db, {
      code: "QA-WH",
      name: "Almacén QA",
      type: "WAREHOUSE",
      parentId: null,
      active: true,
      notes: null,
    });
    const box = await createLocation(db, {
      code: "QA-A12",
      name: "Caja A12",
      type: "BOX",
      parentId: warehouse.id,
      active: true,
      notes: null,
    });

    const base = {
      productMode: "existing" as const,
      productId: product.id,
      brandId: null,
      customBrandName: null,
      componentTypeId: null,
      customComponentTypeName: null,
      partNumber: null,
      compatibleModel: null,
      title: null,
      locationId: warehouse.id,
      boxMode: "existing" as const,
      boxId: box.id,
      newBoxCode: null,
      newBoxName: null,
    };
    await quickAddInventory(db, { ...base, bagLabel: null, quantity: 3 });
    await quickAddInventory(db, { ...base, bagLabel: null, quantity: 2 });
    await quickAddInventory(db, { ...base, bagLabel: "  Bolsa   4  ", quantity: 7 });
    await quickAddInventory(db, { ...base, bagLabel: "Bolsa 4", quantity: 1 });

    const stock = await nodeDb
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, product.id));
    expect(stock).toHaveLength(2);
    expect(stock.find((item) => item.legacyBagNumber === null)?.quantity).toBe(5);
    expect(stock.find((item) => item.legacyBagNumber === "Bolsa 4")?.quantity).toBe(8);
    const movements = await nodeDb
      .select()
      .from(inventoryMovements)
      .where(inArray(inventoryMovements.inventoryItemId, stock.map((item) => item.id)));
    expect(movements.map((movement) => movement.type).sort()).toEqual(["IN", "IN", "INITIAL", "INITIAL"]);
  });

  it("creates a new model, inline box, inventory and audit atomically", async () => {
    const { brand, componentType } = await catalogIds();
    const warehouse = await createLocation(db, {
      code: "QA-NEW-WH",
      name: "Almacén nuevo",
      type: "WAREHOUSE",
      parentId: null,
      active: true,
      notes: null,
    });

    const result = await quickAddInventory(db, {
      productMode: "new",
      productId: null,
      brandId: brand.id,
      customBrandName: null,
      componentTypeId: componentType.id,
      customComponentTypeName: null,
      partNumber: "QUICK-NEW-001",
      compatibleModel: "MODEL-QA",
      title: null,
      locationId: warehouse.id,
      boxMode: "new",
      boxId: null,
      newBoxCode: "QA-B01",
      newBoxName: "Caja B01",
      bagLabel: "Bolsa 12",
      quantity: 4,
    });

    expect(result).toMatchObject({ productCreated: true, boxCreated: true, inventoryCreated: true });
    expect(result.item).toMatchObject({ quantity: 4, legacyBagNumber: "Bolsa 12", locationId: result.box.id });
    expect(await nodeDb.select().from(products).where(eq(products.id, result.product.id))).toHaveLength(1);
    expect(await nodeDb.select().from(inventoryMovements).where(eq(inventoryMovements.inventoryItemId, result.item.id))).toHaveLength(1);
    expect(await nodeDb.select().from(auditLogs).where(eq(auditLogs.entityId, result.item.id))).toHaveLength(1);

    await expect(quickAddInventory(db, {
      productMode: "new",
      productId: null,
      brandId: brand.id,
      customBrandName: null,
      componentTypeId: componentType.id,
      customComponentTypeName: null,
      partNumber: " quick new 001 ",
      compatibleModel: null,
      title: null,
      locationId: warehouse.id,
      boxMode: "new",
      boxId: null,
      newBoxCode: "QA-B02",
      newBoxName: "Caja B02",
      bagLabel: null,
      quantity: 1,
    })).rejects.toThrow(/Ya existe un modelo/u);
    expect(await nodeDb.select().from(locations).where(eq(locations.code, "QA-B02"))).toHaveLength(0);
  });

  it("deletes an empty box, blocks a stocked box and archives a box with history", async () => {
    const product = await createTestProduct();
    const warehouse = await createLocation(db, {
      code: "QA-DEL-WH",
      name: "Almacén borrado",
      type: "WAREHOUSE",
      parentId: null,
      active: true,
      notes: null,
    });
    const empty = await createLocation(db, { code: "QA-EMPTY", name: "Caja vacía", type: "BOX", parentId: warehouse.id, active: true, notes: null });
    expect((await deleteBox(db, { id: empty.id, expectedUpdatedAt: empty.updatedAt })).mode).toBe("deleted");
    expect(await nodeDb.select().from(locations).where(eq(locations.id, empty.id))).toHaveLength(0);
    expect(
      await nodeDb
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, empty.id), eq(auditLogs.action, "LOCATION_DELETED"))),
    ).toHaveLength(1);

    const stocked = await createLocation(db, { code: "QA-STOCK", name: "Caja con stock", type: "BOX", parentId: warehouse.id, active: true, notes: null });
    const item = await createInventoryItem(db, { productId: product.id, locationId: stocked.id, quantity: 2, condition: "UNKNOWN", status: "AVAILABLE", acquiredAt: null, acquisitionSource: null, purchaseCost: null, notes: null, legacyBagNumber: null, legacyLocationCode: null });
    await expect(deleteBox(db, { id: stocked.id, expectedUpdatedAt: stocked.updatedAt })).rejects.toThrow(/contiene 2 unidad/u);

    await recordStockMovement(db, { id: item.id, type: "OUT", quantity: 2, resultingStatus: "SOLD", reason: "Salida total QA" });
    const freshBox = await nodeDb.query.locations.findFirst({ where: eq(locations.id, stocked.id) });
    const archived = await deleteBox(db, { id: stocked.id, expectedUpdatedAt: freshBox!.updatedAt });
    expect(archived.mode).toBe("archived");
    expect(archived.box.active).toBe(false);
    expect(await nodeDb.select().from(inventoryMovements).where(eq(inventoryMovements.inventoryItemId, item.id))).toHaveLength(2);
    expect(
      await nodeDb
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, stocked.id), eq(auditLogs.action, "LOCATION_ARCHIVED"))),
    ).toHaveLength(1);

    const parentBox = await createLocation(db, { code: "QA-PARENT", name: "Caja padre", type: "BOX", parentId: warehouse.id, active: true, notes: null });
    await createLocation(db, { code: "QA-CHILD", name: "Bolsa hija", type: "BAG", parentId: parentBox.id, active: true, notes: null });
    await expect(
      deleteBox(db, { id: parentBox.id, expectedUpdatedAt: parentBox.updatedAt }),
    ).rejects.toThrow(/ubicaci.n\(es\) hija/u);
  });

  it("serializes concurrent creation of the same model", async () => {
    const attempts = await Promise.allSettled([
      createTestProduct(),
      createTestProduct(),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(await nodeDb.select().from(products)).toHaveLength(1);
    const rejection = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejection?.status === "rejected" ? rejection.reason : null).toBeInstanceOf(
      DuplicateEntityError,
    );
  });

  it("does not lose concurrent stock increments for the same model, box and bag", async () => {
    const product = await createTestProduct();
    const warehouse = await createLocation(db, { code: "QA-CON-WH", name: "Almacén concurrente", type: "WAREHOUSE", parentId: null, active: true, notes: null });
    const box = await createLocation(db, { code: "QA-CON-BOX", name: "Caja concurrente", type: "BOX", parentId: warehouse.id, active: true, notes: null });
    const base = {
      productMode: "existing" as const,
      productId: product.id,
      brandId: null,
      customBrandName: null,
      componentTypeId: null,
      customComponentTypeName: null,
      partNumber: null,
      compatibleModel: null,
      title: null,
      locationId: warehouse.id,
      boxMode: "existing" as const,
      boxId: box.id,
      newBoxCode: null,
      newBoxName: null,
    };

    await quickAddInventory(db, { ...base, bagLabel: "Bolsa 4", quantity: 10 });
    await Promise.all([
      quickAddInventory(db, { ...base, bagLabel: " Bolsa 4 ", quantity: 5 }),
      quickAddInventory(db, { ...base, bagLabel: "Bolsa 4", quantity: 7 }),
    ]);

    const stock = await nodeDb
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.productId, product.id), eq(inventoryItems.locationId, box.id)));
    expect(stock).toHaveLength(1);
    expect(stock[0]).toMatchObject({ quantity: 22, legacyBagNumber: "Bolsa 4" });
    const movements = await nodeDb
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.inventoryItemId, stock[0]!.id));
    expect(movements.map(({ type, quantity }) => ({ type, quantity }))).toEqual(
      expect.arrayContaining([
        { type: "INITIAL", quantity: 10 },
        { type: "IN", quantity: 5 },
        { type: "IN", quantity: 7 },
      ]),
    );
  });

  it("keeps deletion and concurrent inventory entry consistent", async () => {
    const product = await createTestProduct();
    const warehouse = await createLocation(db, { code: "QA-RACE-WH", name: "Almacén carrera", type: "WAREHOUSE", parentId: null, active: true, notes: null });
    const box = await createLocation(db, { code: "QA-RACE-BOX", name: "Caja carrera", type: "BOX", parentId: warehouse.id, active: true, notes: null });
    const input = {
      productMode: "existing" as const,
      productId: product.id,
      brandId: null,
      customBrandName: null,
      componentTypeId: null,
      customComponentTypeName: null,
      partNumber: null,
      compatibleModel: null,
      title: null,
      locationId: warehouse.id,
      boxMode: "existing" as const,
      boxId: box.id,
      newBoxCode: null,
      newBoxName: null,
      bagLabel: null,
      quantity: 6,
    };

    const race = await Promise.allSettled([
      quickAddInventory(db, input),
      deleteBox(db, { id: box.id, expectedUpdatedAt: box.updatedAt }),
    ]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(race.filter((result) => result.status === "rejected")).toHaveLength(1);

    const [remainingBox] = await nodeDb.select().from(locations).where(eq(locations.id, box.id));
    const stock = await nodeDb.select().from(inventoryItems).where(eq(inventoryItems.locationId, box.id));
    if (remainingBox) {
      expect(stock).toHaveLength(1);
      expect(stock[0]?.quantity).toBe(6);
    } else {
      expect(stock).toHaveLength(0);
    }
    const orphaned = await pool.query<{ count: string }>(`
      select count(*)::text as count
      from inventory_items i
      left join locations l on l.id = i.location_id
      where i.location_id is not null and l.id is null
    `);
    expect(orphaned.rows[0]?.count).toBe("0");
  });

  it("rolls back a new model when inline box creation collides", async () => {
    const { brand, componentType } = await catalogIds();
    const warehouse = await createLocation(db, { code: "QA-RB-WH", name: "Almacén rollback", type: "WAREHOUSE", parentId: null, active: true, notes: null });
    await createLocation(db, { code: "QA-RB-BOX", name: "Caja existente", type: "BOX", parentId: warehouse.id, active: true, notes: null });

    await expect(
      quickAddInventory(db, {
        productMode: "new",
        productId: null,
        brandId: brand.id,
        customBrandName: null,
        componentTypeId: componentType.id,
        customComponentTypeName: null,
        partNumber: "QA-ROLLBACK-01",
        primarySerialNumber: "QA-ROLLBACK-MAIN",
        secondarySerialNumbers: ["QA-ROLLBACK-ALT"],
        compatibleModel: null,
        title: null,
        locationId: warehouse.id,
        boxMode: "new",
        boxId: null,
        newBoxCode: "QA-RB-BOX",
        newBoxName: "Otra caja",
        bagLabel: null,
        quantity: 3,
      }),
    ).rejects.toThrow(/ya existe/u);
    expect(
      await nodeDb.select().from(products).where(eq(products.partNumber, "QA-ROLLBACK-01")),
    ).toHaveLength(0);
    expect(
      await nodeDb
        .select()
        .from(productSerialNumbers)
        .where(eq(productSerialNumbers.serialNumber, "QA-ROLLBACK-MAIN")),
    ).toHaveLength(0);
  });

  it("handles two concurrent deletes with one audit and one controlled rejection", async () => {
    const warehouse = await createLocation(db, { code: "QA-D2-WH", name: "Almacén doble borrado", type: "WAREHOUSE", parentId: null, active: true, notes: null });
    const box = await createLocation(db, { code: "QA-D2-BOX", name: "Caja doble borrado", type: "BOX", parentId: warehouse.id, active: true, notes: null });

    const results = await Promise.allSettled([
      deleteBox(db, { id: box.id, expectedUpdatedAt: box.updatedAt }),
      deleteBox(db, { id: box.id, expectedUpdatedAt: box.updatedAt }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection?.status === "rejected" ? rejection.reason : null).toMatchObject({
      message: "La caja ya no existe.",
    });
    expect(
      await nodeDb
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, box.id), eq(auditLogs.action, "LOCATION_DELETED"))),
    ).toHaveLength(1);
  });

});
