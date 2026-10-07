import { and, asc, eq, inArray } from "drizzle-orm";
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
  productCompatibilities,
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
import type { DirectImageStorage, ImageStorage, R2PutObject } from "@/features/images/server/r2";
import { authorizeDirectImageUpload, confirmDirectImageUpload } from "@/features/images/server/direct-upload-service";
import { temporaryImageKey } from "@/features/images/server/upload-authorization";
import { directImageUploadSchema, type DirectImageUploadInput } from "@/validators/image";
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
  renameQuickAddLocation,
} from "@/features/locations/server/location-service";
import { quickAddInventory } from "@/features/inventory/server/quick-add-service";
import { resolveCompatibleModel } from "@/features/products/server/compatible-model-service";
import {
  listQuickAddOptions,
  searchCompatibleModels,
  searchInventoryModels,
} from "@/features/inventory/data/quick-add-queries";
import { UNPARENTED_BOXES_LOCATION_ID } from "@/features/locations/domain/quick-add-location";
import {
  archiveProduct,
  createProduct,
  updateProduct,
} from "@/features/products/server/product-service";
import { CUSTOM_CATALOG_VALUE } from "@/features/products/domain/catalog-selection";
import {
  archiveBrandCatalogEntry,
  archiveComponentTypeCatalogEntry,
  createBrandCatalogEntry,
  createComponentTypeCatalogEntry,
  updateBrandCatalogEntry,
  updateComponentTypeCatalogEntry,
} from "@/features/products/server/catalog-service";
import {
  listAdminBrands,
  listAdminComponentTypes,
} from "@/features/products/data/admin-catalog-queries";
import {
  DuplicateEntityError,
  InvalidOperationError,
  RateLimitExceededError,
} from "@/features/shared/domain/service-errors";
import { buildInventoryExport } from "@/features/exports/server/inventory-export";
import { consumeOperationalRateLimit } from "@/features/security/server/rate-limit";
import { createProductMutationSchema, type CreateProductMutationInput } from "@/validators/admin-product";
import { quickAddInventoryMutationSchema } from "@/validators/quick-add-inventory";
import { inventoryListQuerySchema, productListQuerySchema } from "@/validators/admin-query";
import { listAdminInventory } from "@/features/inventory/data/admin-inventory-queries";
import { getAdminProductDetail, getAdminProductReview, listAdminProducts } from "@/features/products/data/admin-product-queries";
import { getPublicProductBySlug, getPublicProducts } from "@/features/catalog/data/public-catalog-queries";
import { productPublicationPath } from "@/features/products/domain/public-product";
import { ConcurrentModificationError } from "@/features/shared/domain/service-errors";

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

  it("persists product condition separately from inventory grading through Quick Add, edit and public reads", async () => {
    const { brand, componentType } = await catalogIds();
    const warehouse = await createLocation(db, { code: "COND-WH", name: "Almacén norte", type: "WAREHOUSE", parentId: null, active: true, notes: null });
    const box = await createLocation(db, { code: "COND-BOX", name: "Caja 18", type: "BOX", parentId: warehouse.id, active: true, notes: null });
    for (const condition of ["NEW", "USED"] as const) {
      const input = quickAddInventoryMutationSchema.parse({ productMode: "new", brandId: brand.id, componentTypeId: componentType.id, partNumber: `COND-${condition}`, condition, compatibilities: [], locationId: warehouse.id, boxMode: "existing", boxId: box.id, bagLabel: "7", quantity: 2 });
      const created = await quickAddInventory(db, input);
      expect(created.product.condition).toBe(condition);
      expect(created.item.condition).toBe("UNKNOWN");
      expect(await getAdminProductDetail(db, created.product.id)).toMatchObject({ condition });
      expect(await getPublicProductBySlug(db, created.product.slug)).toMatchObject({ condition });
      await quickAddInventory(db, quickAddInventoryMutationSchema.parse({ ...input, productMode: "existing", productId: created.product.id, condition: condition === "NEW" ? "USED" : "NEW" }));
      expect((await nodeDb.query.products.findFirst({ where: eq(products.id, created.product.id) }))?.condition).toBe(condition);
      const edited = await updateProduct(db, { ...createProductMutationSchema.parse({ ...input, title: created.product.title, description: null }), id: created.product.id, expectedUpdatedAt: created.product.updatedAt, condition: condition === "NEW" ? "USED" : "NEW" });
      expect(edited.sku).toBe(created.product.sku);
      expect((await getPublicProductBySlug(db, created.product.slug))?.condition).toBe(edited.condition);
    }
    const statements: string[] = [];
    const logged = drizzle(pool, { schema, logger: { logQuery(query) { statements.push(query); } } }) as unknown as Database;
    const listing = await listAdminInventory(logged, inventoryListQuerySchema.parse({}));
    expect(statements).toHaveLength(3);
    expect(listing.rows.every(row => row.placement.boxLabel === "Caja 18" && row.placement.bagLabel === "Bolsa 7" && row.placement.parentLocation === "Almacén norte")).toBe(true);
    const legacy = await createTestProduct({ partNumber: "COND-LEGACY", condition: null });
    expect((await getPublicProductBySlug(db, legacy.slug))?.condition).toBeNull();
  });

  it("commits the complete wizard payload once, then registers ordered direct images and edits warranty", async () => {
    const { brand, componentType } = await catalogIds();
    const warehouse = await createLocation(db, { code: "WIZ-WH", name: "Almacén wizard", type: "WAREHOUSE", parentId: null, active: true, notes: null });
    const input = quickAddInventoryMutationSchema.parse({
      productMode: "new", brandId: brand.id, componentTypeId: componentType.id, title: "Fuente wizard", partNumber: "WIZ-123",
      primarySerialNumber: " MAIN-1 ", secondarySerialNumbers: ["SECOND-1", "SECOND-2"],
      compatibilities: ["TV-1", "TV-2", "TV-3"].map(model => ({ brandId: brand.id, model, notes: null })),
      locationId: warehouse.id, boxMode: "new", newBoxCode: "WIZ-BOX", newBoxName: "Caja 18", bagLabel: " Bolsa 3 ", quantity: 5,
      salePrice: "1250.01", warranty: " 30   días ", currency: "MXN", status: "ACTIVE", condition: "USED", isPublic: true,
    });
    const result = await quickAddInventory(db, input);
    expect(await nodeDb.select().from(products)).toHaveLength(1);
    expect(result.product).toMatchObject({ brandId: brand.id, componentTypeId: componentType.id, partNumber: "WIZ-123", title: "Fuente wizard", salePrice: "1250.01", warranty: "30 días", condition: "USED", status: "ACTIVE", isPublic: true, currency: "MXN" });
    expect(result.item).toMatchObject({ quantity: 5, locationId: result.box.id, legacyBagNumber: "Bolsa 3" });
    expect(result.box).toMatchObject({ parentId: warehouse.id, code: "WIZ-BOX", name: "Caja 18" });
    expect(await nodeDb.select().from(productCompatibilities)).toHaveLength(3);
    expect((await nodeDb.select().from(productSerialNumbers)).map(row => row.serialNumber)).toEqual(expect.arrayContaining(["MAIN-1", "SECOND-1", "SECOND-2"]));
    // Images use the unchanged authorization/confirmation services only after commit.
    const objects = new Map<string, R2PutObject>();
    const storage: DirectImageStorage = {
      async putObject(object) { objects.set(object.objectKey, object); },
      async deleteObject(key) { objects.delete(key); },
      async authorizePut(key) { return `https://local.invalid/${key}`; },
      async inspectTemporary(key) { const object = objects.get(key)!; return { size: object.body.byteLength, contentType: object.contentType, etag: "local-etag" }; },
      async readTemporary(key) { return objects.get(key)!.body; },
      async copyTemporary(key, finalKey) { objects.set(finalKey, { ...objects.get(key)!, objectKey: finalKey }); },
      async deleteTemporary(key) { objects.delete(key); },
    };
    const bytes = Buffer.from("89504e470d0a1a0a00000000", "hex"), secret = "wizard-local-secret";
    const fingerprint = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
    const batchId = crypto.randomUUID();
    for (const position of [2, 1, 0]) {
      const image = directImageUploadSchema.parse({ productId: result.product.id, uploadId: crypto.randomUUID(), batchId, position, filename: `photo-${position}.png`, mimeType: "image/png", size: bytes.length, signatureHex: bytes.toString("hex"), fingerprint });
      const authorized = await authorizeDirectImageUpload(db, storage, image, secret);
      if (!("token" in authorized) || !authorized.token) throw new Error("Expected authorization");
      objects.set(temporaryImageKey(image, secret), { objectKey: temporaryImageKey(image, secret), body: bytes, contentType: "image/png" });
      await confirmDirectImageUpload(db, storage, authorized.token, secret);
    }
    expect((await nodeDb.select().from(productImages).orderBy(asc(productImages.sortOrder))).map(row => ({ order: row.sortOrder, primary: row.isPrimary }))).toEqual([{ order: 0, primary: true }, { order: 1, primary: false }, { order: 2, primary: false }]);
    expect(await getPublicProductBySlug(db, result.product.slug)).toMatchObject({ warranty: "30 días", availability: { key: "IN_STOCK" } });
    await updateProduct(db, { ...createProductMutationSchema.parse({ ...input, description: null }), id: result.product.id, expectedUpdatedAt: result.product.updatedAt, warranty: "90 días" });
    expect(await getAdminProductDetail(db, result.product.id)).toMatchObject({ warranty: "90 días" });
    expect(await getPublicProductBySlug(db, result.product.slug)).toMatchObject({ warranty: "90 días" });
  });

  it("adds inventory-only stock at the same and different boxes without rewriting any product metadata", async () => {
    const product = await createTestProduct({ condition: "USED", primarySerialNumber: "MASTER-SERIAL", secondarySerialNumbers: ["MASTER-ALT"] });
    const parent = await createLocation(db, { code: "REG-WH", name: "Almacén", type: "WAREHOUSE", parentId: null, active: true, notes: null });
    const boxes = await Promise.all(["A", "B"].map(code => createLocation(db, { code: `REG-${code}`, name: `Caja ${code}`, type: "BOX", parentId: parent.id, active: true, notes: null })));
    const input = { productMode: "existing", productId: product.id, locationId: parent.id, boxMode: "existing", boxId: boxes[0]!.id, bagLabel: "Bolsa 2", quantity: 5 };
    const compatibilitiesBefore = await nodeDb.select().from(productCompatibilities).where(eq(productCompatibilities.productId, product.id));
    const serialsBefore = await nodeDb.select().from(productSerialNumbers).where(eq(productSerialNumbers.productId, product.id));
    const initial = await quickAddInventory(db, quickAddInventoryMutationSchema.parse(input));
    const same = await quickAddInventory(db, quickAddInventoryMutationSchema.parse({ ...input, bagLabel: " bolsa   2 ", quantity: 3, salePrice: "bad", condition: "NEW", title: "Overwrite attempt", compatibilities: [] }));
    const other = await quickAddInventory(db, quickAddInventoryMutationSchema.parse({ ...input, boxId: boxes[1]!.id, quantity: 3 }));
    expect(same.item).toMatchObject({ id: initial.item.id, quantity: 8 });
    expect(same).toMatchObject({ productCreated: false, inventoryCreated: false });
    expect(other.item).toMatchObject({ locationId: boxes[1]!.id, quantity: 3 });
    const stock = await nodeDb.select().from(inventoryItems).where(eq(inventoryItems.productId, product.id));
    expect(stock).toHaveLength(2);
    expect(stock.find(row => row.id === initial.item.id)?.quantity).toBe(8);
    expect(await nodeDb.query.products.findFirst({ where: eq(products.id, product.id) })).toEqual(product);
    expect(await nodeDb.select().from(products)).toHaveLength(1);
    expect(await nodeDb.select().from(productCompatibilities).where(eq(productCompatibilities.productId, product.id))).toEqual(compatibilitiesBefore);
    expect(await nodeDb.select().from(productSerialNumbers).where(eq(productSerialNumbers.productId, product.id))).toEqual(serialsBefore);
    const movements = await nodeDb.select().from(inventoryMovements);
    expect(movements.map(({ type, quantity }) => ({ type, quantity }))).toEqual(expect.arrayContaining([{ type: "INITIAL", quantity: 5 }, { type: "IN", quantity: 3 }, { type: "INITIAL", quantity: 3 }]));
    expect(movements).toHaveLength(3);
  });

  it("revalidates deleted products, inactive parents, inactive boxes and mismatched box parents", async () => {
    const product = await createTestProduct();
    const parent = await createLocation(db, { code: "STALE-WH", name: "Almacén", type: "WAREHOUSE", parentId: null, active: true, notes: null });
    const otherParent = await createLocation(db, { code: "STALE-OTHER", name: "Otro almacén", type: "WAREHOUSE", parentId: null, active: true, notes: null });
    const box = await createLocation(db, { code: "STALE-BOX", name: "Caja", type: "BOX", parentId: parent.id, active: true, notes: null });
    const input = quickAddInventoryMutationSchema.parse({ productMode: "existing", productId: product.id, locationId: parent.id, boxMode: "existing", boxId: box.id, quantity: 3 });
    await expect(quickAddInventory(db, { ...input, locationId: otherParent.id })).rejects.toThrow();
    await nodeDb.update(locations).set({ active: false }).where(eq(locations.id, parent.id));
    await expect(quickAddInventory(db, input)).rejects.toThrow();
    await nodeDb.update(locations).set({ active: true }).where(eq(locations.id, parent.id));
    await nodeDb.update(locations).set({ active: false }).where(eq(locations.id, box.id));
    await expect(quickAddInventory(db, input)).rejects.toThrow();
    await nodeDb.update(locations).set({ active: true }).where(eq(locations.id, box.id));
    await nodeDb.update(products).set({ deletedAt: new Date() }).where(eq(products.id, product.id));
    await expect(quickAddInventory(db, input)).rejects.toThrow();
    expect(await nodeDb.select().from(inventoryItems)).toHaveLength(0);
    expect(await nodeDb.select().from(inventoryMovements)).toHaveLength(0);
  });

  it("resolves inline model drafts server-side, reuses normalized matches, and persists them only with the product", async () => {
    const { brand, componentType } = await catalogIds();
    const drafts = await Promise.all(["Samsung 75H78G", " SAMSUNG   75h78g "].map(model => resolveCompatibleModel(db, { brandId: brand.id, model })));
    expect(drafts[0]?.compatibility).toMatchObject({ brandId: brand.id, model: "75H78G" });
    expect(await nodeDb.select().from(productCompatibilities)).toHaveLength(0);
    const parent = await createLocation(db, { code: "MODEL-WH", name: "Almacén", type: "WAREHOUSE", parentId: null, active: true, notes: null });
    const input = quickAddInventoryMutationSchema.parse({ productMode: "new", brandId: brand.id, componentTypeId: componentType.id, partNumber: "MODEL-REG", compatibilities: [drafts[0]!.compatibility], salePrice: "1250.01", condition: "USED", locationId: parent.id, boxMode: "new", newBoxCode: "MODEL-BOX", newBoxName: "Caja", quantity: 3 });
    const created = await quickAddInventory(db, input);
    expect(created.product).toMatchObject({ salePrice: "1250.01", currency: "MXN", condition: "USED", status: "ACTIVE", isPublic: true });
    expect(created.item.quantity).toBe(3);
    expect(await nodeDb.select().from(inventoryMovements)).toHaveLength(1);
    const equivalent = await resolveCompatibleModel(db, { brandId: brand.id, model: " SAMSUNG   75h78g " });
    expect(equivalent).toMatchObject({ reused: true, compatibility: drafts[0]!.compatibility });
    await expect(quickAddInventory(db, quickAddInventoryMutationSchema.parse({ ...input, partNumber: "MODEL-DUP", compatibilities: drafts.map(draft => draft.compatibility) }))).rejects.toThrow(/misma identidad/u);
    expect(await nodeDb.select().from(products)).toHaveLength(1);
    expect(await nodeDb.select().from(productCompatibilities)).toHaveLength(1);
    expect(await searchCompatibleModels(db, "75h", brand.id)).toHaveLength(1);
    await nodeDb.update(brands).set({ active: false }).where(eq(brands.id, brand.id));
    await expect(resolveCompatibleModel(db, { brandId: brand.id, model: "75H78G" })).rejects.toThrow(/marca/u);
  });

  it("persists Quick Add publication fields through edit, catalog and bounded list queries", async () => {
    const { brand, componentType } = await catalogIds();
    const warehouse = await createLocation(db, { code: "PUB-WH", name: "Almacén publicación", type: "WAREHOUSE", parentId: null, active: true, notes: null });
    const box = await createLocation(db, { code: "PUB-BOX", name: "Caja publicación", type: "BOX", parentId: warehouse.id, active: true, notes: null });
    for (const status of ["ACTIVE", "DRAFT", "ARCHIVED"] as const) {
      for (const isPublic of [true, false]) {
        const result = await quickAddInventory(db, quickAddInventoryMutationSchema.parse({
          productMode: "new", brandId: brand.id, componentTypeId: componentType.id,
          partNumber: `PUB-${status}-${isPublic}`, salePrice: "1250.01", status, isPublic,
          compatibilities: [{ brandId: brand.id, model: "MODELO PUBLICACIÓN", notes: null }],
          locationId: warehouse.id, boxMode: "existing", boxId: box.id, quantity: 5,
        }));
        const visible = status === "ACTIVE" && isPublic;
        const edited = await getAdminProductDetail(db, result.product.id);
        expect(edited).toMatchObject({ salePrice: "1250.01", currency: "MXN", status, isPublic: visible });
        const publication = await getPublicProductBySlug(db, result.product.slug);
        expect(Boolean(publication)).toBe(visible);
        expect(Boolean(productPublicationPath(result.product))).toBe(visible);
        if (visible) expect(publication).toMatchObject({ salePrice: "1250.01", currency: "MXN" });
      }
    }
    const statements: string[] = [];
    const loggedDb = drizzle(pool, { schema, logger: { logQuery(query) { statements.push(query); } } }) as unknown as Database;
    const list = await listAdminProducts(loggedDb, productListQuerySchema.parse({}));
    expect(list.total).toBe(6);
    expect(list.rows.every((row) => row.salePrice === "1250.01" && row.compatibilityCount === 1)).toBe(true);
    expect(statements).toHaveLength(2);
    statements.length = 0;
    const review = await getAdminProductReview(loggedDb, list.rows[0]!.id);
    expect(review?.compatibilities).toEqual([{ brand: brand.name, model: "MODELO PUBLICACIÓN" }]);
    expect(statements).toHaveLength(3);
  });

  it("renames physical Quick Add locations without moving boxes or stock and rejects stale edits", async () => {
    const product = await createTestProduct();
    const warehouse = await createLocation(db, { code: "RENAME-WH", name: "Almacén anterior", type: "WAREHOUSE", parentId: null, active: true, notes: "Conservar notas" });
    const box = await createLocation(db, { code: "RENAME-BOX", name: "Caja anterior", type: "BOX", parentId: warehouse.id, active: true, notes: null });
    const stock = await quickAddInventory(db, quickAddInventoryMutationSchema.parse({ productMode: "existing", productId: product.id, compatibilities: [], locationId: warehouse.id, boxMode: "existing", boxId: box.id, quantity: 3 }));
    const renamed = await renameQuickAddLocation(db, { id: warehouse.id, name: "Almacén norte", expectedUpdatedAt: warehouse.updatedAt });
    expect(renamed).toMatchObject({ name: "Almacén norte", type: "WAREHOUSE", parentId: null, code: warehouse.code, notes: warehouse.notes, active: true });
    expect((await listQuickAddOptions(db)).locations).toContainEqual(expect.objectContaining({ id: warehouse.id, name: "Almacén norte", updatedAt: renamed.updatedAt.toISOString() }));
    expect(await nodeDb.query.locations.findFirst({ where: eq(locations.id, box.id) })).toMatchObject({ parentId: warehouse.id });
    expect(await nodeDb.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, stock.item.id) })).toMatchObject({ locationId: box.id, quantity: 3 });
    await expect(renameQuickAddLocation(db, { id: warehouse.id, name: "Cambio obsoleto", expectedUpdatedAt: warehouse.updatedAt })).rejects.toBeInstanceOf(ConcurrentModificationError);
    await expect(renameQuickAddLocation(db, { id: box.id, name: "No editar caja", expectedUpdatedAt: box.updatedAt })).rejects.toThrow();
  });

  it("manages brands and piece types with normalized reuse, aliases, search and safe deactivation", async () => {
    const brandResult = await createBrandCatalogEntry(db, { name: "  Bosch   México " });
    expect(brandResult.created).toBe(true);
    const duplicateBrand = await createBrandCatalogEntry(db, { name: "BOSCH MEXICO" });
    expect(duplicateBrand).toMatchObject({ created: false, entry: { id: brandResult.entry.id } });

    const typeResult = await createComponentTypeCatalogEntry(db, { name: " Sensor ABS " });
    expect(typeResult.created).toBe(true);
    const duplicateType = await createComponentTypeCatalogEntry(db, { name: "sensor abs" });
    expect(duplicateType).toMatchObject({ created: false, entry: { id: typeResult.entry.id } });

    const freshBrand = await nodeDb.query.brands.findFirst({ where: eq(brands.id, brandResult.entry.id) });
    const freshType = await nodeDb.query.componentTypes.findFirst({ where: eq(componentTypes.id, typeResult.entry.id) });
    const renamedBrand = await updateBrandCatalogEntry(db, {
      id: brandResult.entry.id,
      expectedUpdatedAt: freshBrand!.updatedAt,
      name: "Bosch Mobility",
    });
    const renamedType = await updateComponentTypeCatalogEntry(db, {
      id: typeResult.entry.id,
      expectedUpdatedAt: freshType!.updatedAt,
      name: "Sensor de ABS",
    });
    expect((await createBrandCatalogEntry(db, { name: "bosch méxico" })).entry.id).toBe(renamedBrand.id);
    expect((await createComponentTypeCatalogEntry(db, { name: "SENSOR ABS" })).entry.id).toBe(renamedType.id);
    expect(await listAdminBrands(db, "Mobility")).toEqual([
      expect.objectContaining({ id: renamedBrand.id, productCount: 0 }),
    ]);
    expect(await listAdminComponentTypes(db, "Sensor de")).toEqual([
      expect.objectContaining({ id: renamedType.id, productCount: 0 }),
    ]);

    await createProduct(db, {
      brandId: renamedBrand.id,
      componentTypeId: renamedType.id,
      partNumber: "CATALOG-SAFE-01",
      title: null,
      description: null,
      salePrice: null,
      currency: "MXN",
      status: "DRAFT",
      isPublic: false,
      compatibilities: [],
    });
    const usedBrand = await nodeDb.query.brands.findFirst({ where: eq(brands.id, renamedBrand.id) });
    const usedType = await nodeDb.query.componentTypes.findFirst({ where: eq(componentTypes.id, renamedType.id) });
    await expect(archiveBrandCatalogEntry(db, {
      id: renamedBrand.id,
      expectedUpdatedAt: usedBrand!.updatedAt,
    })).rejects.toThrow(/utilizada/u);
    await expect(archiveComponentTypeCatalogEntry(db, {
      id: renamedType.id,
      expectedUpdatedAt: usedType!.updatedAt,
    })).rejects.toThrow(/utilizado/u);

    const unusedBrand = await createBrandCatalogEntry(db, { name: "Marca sin uso" });
    const unusedType = await createComponentTypeCatalogEntry(db, { name: "Pieza sin uso" });
    const unusedBrandRow = await nodeDb.query.brands.findFirst({ where: eq(brands.id, unusedBrand.entry.id) });
    const unusedTypeRow = await nodeDb.query.componentTypes.findFirst({ where: eq(componentTypes.id, unusedType.entry.id) });
    expect((await archiveBrandCatalogEntry(db, {
      id: unusedBrand.entry.id,
      expectedUpdatedAt: unusedBrandRow!.updatedAt,
    })).active).toBe(false);
    expect((await archiveComponentTypeCatalogEntry(db, {
      id: unusedType.entry.id,
      expectedUpdatedAt: unusedTypeRow!.updatedAt,
    })).active).toBe(false);
  });

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

  it("persists zero, one and multiple compatible models and searches normalized suggestions", async () => {
    const { brand, componentType } = await catalogIds();
    const withoutModels = await createTestProduct({
      partNumber: "COMPAT-0",
      compatibilities: [],
    });
    const oneModel = await createTestProduct({
      partNumber: "COMPAT-1",
      compatibilities: [
        { brandId: brand.id, model: "UN55NU7100FXZX", notes: null },
      ],
    });
    const threeModels = await createTestProduct({
      partNumber: "COMPAT-3",
      compatibilities: [
        { brandId: brand.id, model: "UN55NU7100FXZX", notes: "Con nota" },
        { brandId: brand.id, model: "UN58NU7100FXZX", notes: null },
        { brandId: brand.id, model: "UN50AU7000FXZX", notes: null },
      ],
    });

    const compatibilityRows = await nodeDb
      .select()
      .from(productCompatibilities)
      .where(inArray(productCompatibilities.productId, [
        withoutModels.id,
        oneModel.id,
        threeModels.id,
      ]));
    expect(compatibilityRows.filter(({ productId }) => productId === withoutModels.id)).toHaveLength(0);
    expect(compatibilityRows.filter(({ productId }) => productId === oneModel.id)).toHaveLength(1);
    expect(compatibilityRows.filter(({ productId }) => productId === threeModels.id)).toHaveLength(3);

    const suggestions = await searchCompatibleModels(db, "un55nu7100");
    expect(suggestions).toEqual([
      expect.objectContaining({
        brandId: brand.id,
        model: "UN55NU7100FXZX",
        normalizedModel: "UN55NU7100FXZX",
      }),
    ]);

    const updated = await updateProduct(db, {
      id: threeModels.id,
      expectedUpdatedAt: threeModels.updatedAt,
      brandId: brand.id,
      componentTypeId: componentType.id,
      partNumber: threeModels.partNumber,
      title: threeModels.title,
      description: threeModels.description,
      salePrice: threeModels.salePrice,
      currency: threeModels.currency,
      status: threeModels.status,
      isPublic: threeModels.isPublic,
      compatibilities: [
        { brandId: brand.id, model: "UN55NU7100FXZX", notes: "Con nota" },
        { brandId: brand.id, model: "UN50AU7000FXZX", notes: null },
        { brandId: brand.id, model: "UN65CU7000FXZX", notes: null },
      ],
    });
    expect(updated.id).toBe(threeModels.id);
    const reloadedModels = await nodeDb
      .select({ model: productCompatibilities.model, notes: productCompatibilities.notes })
      .from(productCompatibilities)
      .where(eq(productCompatibilities.productId, threeModels.id));
    expect(reloadedModels).toEqual(expect.arrayContaining([
      { model: "UN55NU7100FXZX", notes: "Con nota" },
      { model: "UN50AU7000FXZX", notes: null },
      { model: "UN65CU7000FXZX", notes: null },
    ]));
    expect(reloadedModels).toHaveLength(3);
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
      .where(eq(inventoryMovements.inventoryItemId, item.id))
      .orderBy(asc(inventoryMovements.createdAt));
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
    const domainMovements = await nodeDb.select({ type: inventoryMovements.type }).from(inventoryMovements).where(eq(inventoryMovements.inventoryItemId, item.id)).orderBy(asc(inventoryMovements.createdAt));
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

  for (const kind of ["products", "inventory"] as const) {
    it(`${kind} search matches domain identifiers, filters and pagination with bounded SQL`, async () => {
      const { brand, componentType } = await catalogIds();
      const product = await createTestProduct({ title: "Search capacitor", primarySerialNumber: "MAIN-SEARCH", secondarySerialNumbers: ["SECOND-SEARCH", "SECOND-SEARCH-B"] });
      const root = await createLocation(db, { code: "SEARCH-WH", name: "Almacén norte", type: "WAREHOUSE", parentId: null, active: true, notes: null });
      const box = await createLocation(db, { code: "SEARCH-BOX", name: "Caja azul", type: "BOX", parentId: root.id, active: true, notes: null });
      await quickAddInventory(db, quickAddInventoryMutationSchema.parse({ productMode: "existing", productId: product.id, compatibilities: [], locationId: root.id, boxMode: "existing", boxId: box.id, quantity: 1 }));
      const statements: string[] = [];
      const logged = drizzle(pool, { schema, logger: { logQuery(query) { statements.push(query); } } }) as unknown as Database;
      const run = (raw: Record<string, string>) => kind === "products" ? listAdminProducts(logged, productListQuerySchema.parse(raw)) : listAdminInventory(logged, inventoryListQuerySchema.parse(raw));
      const terms = ["", "capaci", product.sku, product.sku.toLowerCase(), "  Search capacitor  ", "bn94-07820f", "BN9407820F", brand.name, componentType.name, "main-search", "second-search", "UN58H5200SXZX", "un58h5200sxzx"];
      if (kind === "inventory") terms.push("Almacén norte", "Caja azul", "SEARCH-BOX", "SEARCH-WH");
      for (const q of terms) {
        statements.length = 0;
        const result = await run({ q });
        expect(result.total, q).toBe(1); expect(result.rows, q).toHaveLength(1);
        expect(statements, q).toHaveLength(kind === "products" ? 2 : 3);
      }
      expect((await run({ q: "does-not-exist" })).total).toBe(0);
      expect((await run({ q: "%" })).total).toBe(0);
      expect((await run({ q: "Search", status: kind === "products" ? "ARCHIVED" : "SOLD" })).total).toBe(0);
      expect((await run({ q: "Search", page: "2" })).rows).toHaveLength(0);
      expect((await run({ q: "Search", page: "1" })).rows).toHaveLength(1);
    });
  }

  it("keeps primary first through three-image reorder, promotion, deletion and failed writes", async () => {
    const product = await createTestProduct();
    const objects = new Map<string, R2PutObject>();
    const storage: ImageStorage = { async putObject(input) { objects.set(input.objectKey, input); }, async deleteObject(key) { objects.delete(key); } };
    const input = { productId: product.id, filename: "photo.png", mimeType: "image/png", bytes: Buffer.from("89504e470d0a1a0a00000000", "hex") };
    const photos = [];
    for (let index = 0; index < 3; index++) photos.push(await createProductImage(db, storage, { ...input, uploadId: crypto.randomUUID() }));
    const ids = [photos[2]!.id, photos[0]!.id, photos[1]!.id];
    await reorderProductImages(db, product.id, ids);
    const read = () => nodeDb.select().from(productImages).where(eq(productImages.productId, product.id)).orderBy(asc(productImages.sortOrder));
    expect((await read()).map(({ id, isPrimary, sortOrder }) => ({ id, isPrimary, sortOrder }))).toEqual(ids.map((id, sortOrder) => ({ id, sortOrder, isPrimary: sortOrder === 0 })));
    await expect(reorderProductImages(db, product.id, [ids[0]!, ids[0]!, ids[2]!])).rejects.toThrow();
    await expect(reorderProductImages(db, product.id, [crypto.randomUUID(), ids[1]!, ids[2]!])).rejects.toThrow();
    expect((await read()).map(({ id }) => id)).toEqual(ids);
    await updateProductImage(db, { imageId: ids[2]!, makePrimary: true });
    expect((await read()).map(({ id }) => id)).toEqual([ids[2], ids[0], ids[1]]);
    expect((await read()).filter(({ isPrimary }) => isPrimary)).toHaveLength(1);
    const admin = await listAdminProducts(db, productListQuerySchema.parse({ q: product.sku }));
    const publication = await getPublicProductBySlug(db, product.slug);
    expect(admin.rows[0]!.primaryImage).toBe(publication!.images[0]!.url);
    expect(publication!.images[0]!.url).toContain(photos[1]!.storageKey!);
    const catalog = await getPublicProducts(db, { q: product.sku, sort: "recientes", page: 1 });
    expect(catalog.products[0]!.primaryImage?.url).toBe(publication!.images[0]!.url);
    await deleteProductImage(db, storage, ids[2]!);
    expect((await read())[0]).toMatchObject({ id: ids[0], isPrimary: true, sortOrder: 0 });
    expect(objects.size).toBe(2);
  });

  it("replays successful uploads without duplicates and rejects changed content for the same selection", async () => {
    const product = await createTestProduct();
    let writes = 0;
    const storage: ImageStorage = { async putObject() { writes++; }, async deleteObject() {} };
    const input = { productId: product.id, uploadId: crypto.randomUUID(), filename: "photo.png", mimeType: "image/png", bytes: Buffer.from("89504e470d0a1a0a00000000", "hex") };
    const first = await createProductImage(db, storage, input);
    const repeat = await createProductImage(db, storage, input);
    expect(repeat.id).toBe(first.id); expect(writes).toBe(1);
    const concurrentInput = { ...input, uploadId: crypto.randomUUID() };
    const [left, right] = await Promise.all([createProductImage(db, storage, concurrentInput), createProductImage(db, storage, concurrentInput)]);
    expect(left.id).toBe(right.id); expect(writes).toBe(2);
    await expect(createProductImage(db, storage, { ...input, bytes: Buffer.from("89504e470d0a1a0a01000000", "hex") })).rejects.toThrow();
    expect(writes).toBe(2);
    expect(await nodeDb.select().from(productImages).where(eq(productImages.productId, product.id))).toHaveLength(2);
  });

  async function directImageFixture() {
    const product = await createTestProduct();
    const secret = "disposable-direct-upload-secret";
    const objects = new Map<string, R2PutObject>();
    let copies = 0;
    const storage: DirectImageStorage = {
      async putObject(input) { objects.set(input.objectKey, input); },
      async deleteObject(key) { objects.delete(key); },
      async authorizePut(key) { return `https://local.invalid/${key}`; },
      async inspectTemporary(key) { const object = objects.get(key); if (!object) throw new Error("Missing staged image"); return { size: object.body.byteLength, contentType: object.contentType, etag: "verified-etag" }; },
      async readTemporary(key) { const object = objects.get(key); if (!object) throw new Error("Missing staged image"); return object.body; },
      async copyTemporary(key, finalKey) { const object = objects.get(key); if (!object) throw new Error("Missing staged image"); copies++; objects.set(finalKey, { ...object, objectKey: finalKey }); },
      async deleteTemporary(key) { objects.delete(key); },
    };
    const bytes = Buffer.from("89504e470d0a1a0a00000000", "hex");
    const fingerprint = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
    const base = directImageUploadSchema.parse({ productId: product.id, uploadId: crypto.randomUUID(), batchId: crypto.randomUUID(), position: 0,
      filename: "photo.png", mimeType: "image/png", size: bytes.length, signatureHex: bytes.subarray(0, 12).toString("hex"), fingerprint });
    async function stage(input: DirectImageUploadInput = base, content = bytes) {
      const authorization = await authorizeDirectImageUpload(db, storage, input, secret);
      if (!("token" in authorization) || !authorization.token) throw new Error("Expected new authorization");
      const key = temporaryImageKey(input, secret);
      objects.set(key, { objectKey: key, body: content, contentType: input.mimeType });
      return authorization.token;
    }
    return { product, secret, objects, storage, bytes, base, stage, copies: () => copies };
  }

  it("authorizes without a DB association, verifies R2, and concurrently replays confirmation once", async () => {
    const f = await directImageFixture();
    await authorizeDirectImageUpload(db, f.storage, f.base, f.secret);
    expect(await nodeDb.select().from(productImages)).toHaveLength(0); expect(f.objects.size).toBe(0);
    const token = await f.stage();
    const [left, right] = await Promise.all([confirmDirectImageUpload(db, f.storage, token, f.secret), confirmDirectImageUpload(db, f.storage, token, f.secret)]);
    expect(left.id).toBe(right.id); expect(f.copies()).toBe(1); expect(f.objects.size).toBe(1);
    expect(left.storageKey).toMatch(/^products\//u); expect(left.metadata?.fingerprint).toBe(f.base.fingerprint);
    expect((await authorizeDirectImageUpload(db, f.storage, f.base, f.secret)).image?.id).toBe(left.id);
    const other = await createTestProduct({ partNumber: "OTHER-UPLOAD" });
    await expect(authorizeDirectImageUpload(db, f.storage, { ...f.base, productId: other.id }, f.secret)).rejects.toThrow();
    await expect(authorizeDirectImageUpload(db, f.storage, { ...f.base, fingerprint: "a".repeat(64) }, f.secret)).rejects.toThrow();
  });

  it("rejects missing, wrong-size, wrong-content, wrong-MIME and invalid-signature R2 objects before registration", async () => {
    const f = await directImageFixture();
    const authorization = await authorizeDirectImageUpload(db, f.storage, f.base, f.secret);
    if (!("token" in authorization) || !authorization.token) throw new Error();
    await expect(confirmDirectImageUpload(db, f.storage, authorization.token, f.secret)).rejects.toThrow();
    for (const bytes of [Buffer.alloc(f.bytes.length + 1), Buffer.alloc(f.bytes.length), Buffer.alloc(10 * 1024 * 1024 + 1)]) {
      const token = await f.stage(f.base, bytes);
      await expect(confirmDirectImageUpload(db, f.storage, token, f.secret)).rejects.toThrow();
      expect(f.objects.size).toBe(0);
    }
    const token = await f.stage();
    f.objects.get(temporaryImageKey(f.base, f.secret))!.contentType = "image/jpeg";
    await expect(confirmDirectImageUpload(db, f.storage, token, f.secret)).rejects.toThrow();
    const badBytes = Buffer.alloc(f.bytes.length);
    const badFingerprint = Buffer.from(await crypto.subtle.digest("SHA-256", badBytes)).toString("hex");
    const invalidSignatureToken = await f.stage({ ...f.base, fingerprint: badFingerprint }, badBytes);
    await expect(confirmDirectImageUpload(db, f.storage, invalidSignatureToken, f.secret)).rejects.toThrow(/firma/);
    expect(await nodeDb.select().from(productImages)).toHaveLength(0); expect(f.copies()).toBe(0); expect(f.objects.size).toBe(0);
  });

  it("rolls back DB registration and safely cleans the copied final object before retry", async () => {
    const f = await directImageFixture(); const token = await f.stage();
    // Fail the audit insert after image/storage creation to exercise actual DB rollback.
    await pool.query("create function fail_direct_image_audit() returns trigger language plpgsql as $$ begin if NEW.action = 'PRODUCT_IMAGE_ADDED' then raise exception 'test registration failure'; end if; return NEW; end $$");
    await pool.query("create trigger direct_image_audit_failure before insert on audit_logs for each row execute function fail_direct_image_audit()");
    try { await expect(confirmDirectImageUpload(db, f.storage, token, f.secret)).rejects.toThrow(); }
    finally { await pool.query("drop trigger direct_image_audit_failure on audit_logs"); await pool.query("drop function fail_direct_image_audit()"); }
    expect(await nodeDb.select().from(productImages)).toHaveLength(0); expect(f.objects.size).toBe(0);
    const retry = await f.stage(); await confirmDirectImageUpload(db, f.storage, retry, f.secret);
    expect(await nodeDb.select().from(productImages)).toHaveLength(1); expect(f.objects.size).toBe(1);
  });

  it("restores selected primary-first order when later photos finish before a failed photo retries", async () => {
    const f = await directImageFixture();
    const inputs = [0, 1, 2].map(position => ({ ...f.base, uploadId: crypto.randomUUID(), position }));
    for (const index of [1, 2, 0]) {
      const confirmed = await confirmDirectImageUpload(db, f.storage, await f.stage(inputs[index]!), f.secret);
      if (index === 0) expect(confirmed).toMatchObject({ sortOrder: 0, isPrimary: true });
    }
    const saved = await nodeDb.select().from(productImages).orderBy(asc(productImages.sortOrder));
    expect(saved.map(({ id }) => id)).toEqual(inputs.map(({ uploadId }) => uploadId));
    expect(saved.map(({ sortOrder, isPrimary }) => ({ sortOrder, isPrimary }))).toEqual(inputs.map((_, sortOrder) => ({ sortOrder, isPrimary: sortOrder === 0 })));
    expect(f.objects.size).toBe(3);
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
      salePrice: null, currency: "MXN", status: "ACTIVE" as const, isPublic: true,
      productMode: "existing" as const,
      productId: product.id,
      brandId: null,
      customBrandName: null,
      componentTypeId: null,
      customComponentTypeName: null,
      partNumber: null,
      compatibilities: [],
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

  it("uses the same active-location rules in Quick Add and safely exposes legacy root boxes", async () => {
    const product = await createTestProduct();
    const activeWarehouse = await createLocation(db, {
      code: "QA-ACTIVE-WH",
      name: "Almacén activo",
      type: "WAREHOUSE",
      parentId: null,
      active: true,
      notes: null,
    });
    const activeBox = await createLocation(db, {
      code: "QA-ACTIVE-BOX",
      name: "Caja activa",
      type: "BOX",
      parentId: activeWarehouse.id,
      active: true,
      notes: null,
    });
    const emptyWarehouse = await createLocation(db, {
      code: "QA-EMPTY-WH",
      name: "Almacén activo sin cajas",
      type: "WAREHOUSE",
      parentId: null,
      active: true,
      notes: null,
    });
    const inactiveWarehouse = await createLocation(db, {
      code: "QA-INACTIVE-WH",
      name: "Almacén inactivo",
      type: "WAREHOUSE",
      parentId: null,
      active: false,
      notes: null,
    });
    const inactiveParentBox = await createLocation(db, {
      code: "QA-INACTIVE-BOX",
      name: "Caja con padre inactivo",
      type: "BOX",
      parentId: inactiveWarehouse.id,
      active: true,
      notes: null,
    });
    const legacyRootBox = await createLocation(db, {
      code: "QA-ROOT-BOX",
      name: "Caja raíz activa",
      type: "BOX",
      parentId: null,
      active: true,
      notes: null,
    });
    const deletedWarehouse = await createLocation(db, {
      code: "QA-DELETED-WH",
      name: "Ubicación eliminada",
      type: "WAREHOUSE",
      parentId: null,
      active: true,
      notes: null,
    });
    await nodeDb.delete(locations).where(eq(locations.id, deletedWarehouse.id));

    const options = await listQuickAddOptions(db);
    expect(options.locations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: activeWarehouse.id, kind: "container" }),
      expect.objectContaining({ id: emptyWarehouse.id, kind: "container" }),
      expect.objectContaining({
        id: UNPARENTED_BOXES_LOCATION_ID,
        kind: "unparented-boxes",
      }),
    ]));
    expect(options.locations.map(({ id }) => id)).not.toContain(inactiveWarehouse.id);
    expect(options.locations.map(({ id }) => id)).not.toContain(deletedWarehouse.id);
    expect(options.boxes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: activeBox.id, parentId: activeWarehouse.id }),
      expect.objectContaining({
        id: legacyRootBox.id,
        parentId: UNPARENTED_BOXES_LOCATION_ID,
      }),
    ]));
    expect(options.boxes.map(({ id }) => id)).not.toContain(inactiveParentBox.id);
    expect(options.boxes.some(({ parentId }) => parentId === emptyWarehouse.id)).toBe(false);
    expect(options.locationAvailability).toMatchObject({
      total: 3,
      active: 2,
      inactive: 1,
      unparentedBoxes: 1,
    });

    const base = {
      salePrice: null, currency: "MXN", status: "ACTIVE" as const, isPublic: true,
      productMode: "existing" as const,
      productId: product.id,
      brandId: null,
      customBrandName: null,
      componentTypeId: null,
      customComponentTypeName: null,
      partNumber: null,
      compatibilities: [],
      title: null,
      locationId: UNPARENTED_BOXES_LOCATION_ID,
      boxMode: "existing" as const,
      boxId: legacyRootBox.id,
      newBoxCode: null,
      newBoxName: null,
      bagLabel: null,
      quantity: 2,
    };
    const added = await quickAddInventory(db, base);
    expect(added.item).toMatchObject({ locationId: legacyRootBox.id, quantity: 2 });
    await expect(quickAddInventory(db, {
      ...base,
      boxMode: "new",
      boxId: null,
      newBoxCode: "QA-ROOT-CHILD",
      newBoxName: "Caja sin contenedor",
    })).rejects.toThrow(/ubicación contenedora/u);
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
      condition: "NEW",
      salePrice: null, currency: "MXN", status: "ACTIVE" as const, isPublic: true,
      productMode: "new",
      productId: null,
      brandId: brand.id,
      customBrandName: null,
      componentTypeId: componentType.id,
      customComponentTypeName: null,
      partNumber: "QUICK-NEW-001",
      compatibilities: [{ brandId: brand.id, model: "MODEL-QA", notes: null }],
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
      salePrice: null, currency: "MXN", status: "ACTIVE" as const, isPublic: true,
      productMode: "new",
      condition: "NEW",
      productId: null,
      brandId: brand.id,
      customBrandName: null,
      componentTypeId: componentType.id,
      customComponentTypeName: null,
      partNumber: " quick new 001 ",
      compatibilities: [],
      title: null,
      locationId: warehouse.id,
      boxMode: "new",
      boxId: null,
      newBoxCode: "QA-B02",
      newBoxName: "Caja B02",
      bagLabel: null,
      quantity: 1,
    })).rejects.toThrow(/Ya existe un producto/u);
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
      salePrice: null, currency: "MXN", status: "ACTIVE" as const, isPublic: true,
      productMode: "existing" as const,
      productId: product.id,
      brandId: null,
      customBrandName: null,
      componentTypeId: null,
      customComponentTypeName: null,
      partNumber: null,
      compatibilities: [],
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
      salePrice: null, currency: "MXN", status: "ACTIVE" as const, isPublic: true,
      productMode: "existing" as const,
      productId: product.id,
      brandId: null,
      customBrandName: null,
      componentTypeId: null,
      customComponentTypeName: null,
      partNumber: null,
      compatibilities: [],
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
        salePrice: null, currency: "MXN", status: "ACTIVE" as const, isPublic: true,
        productMode: "new",
        productId: null,
        brandId: brand.id,
        customBrandName: null,
        componentTypeId: componentType.id,
        customComponentTypeName: null,
        partNumber: "QA-ROLLBACK-01",
        condition: "NEW",
        primarySerialNumber: "QA-ROLLBACK-MAIN",
        secondarySerialNumbers: ["QA-ROLLBACK-ALT"],
        compatibilities: [],
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
