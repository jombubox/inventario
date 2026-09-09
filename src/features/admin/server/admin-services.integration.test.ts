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
  createLocation,
  updateLocation,
} from "@/features/locations/server/location-service";
import {
  archiveProduct,
  createProduct,
  updateProduct,
} from "@/features/products/server/product-service";
import {
  DuplicateEntityError,
  InvalidOperationError,
  RateLimitExceededError,
} from "@/features/shared/domain/service-errors";
import { buildInventoryExport } from "@/features/exports/server/inventory-export";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";

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

  async function createTestProduct() {
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

  it("serializes concurrent product identity allocation", async () => {
    const attempts = await Promise.allSettled([createTestProduct(), createTestProduct()]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(DuplicateEntityError) });
    expect(await nodeDb.select().from(schema.products)).toHaveLength(1);
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

});
