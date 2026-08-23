import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@/db/connection";
import { seedDatabase } from "@/db/seed";
import * as schema from "@/db/schema";
import {
  brands,
  componentTypes,
  inventoryItems,
  productCompatibilities,
  products,
} from "@/db/schema";
import {
  getPublicBrands,
  getPublicComponentTypes,
  getPublicProductBySlug,
  getPublicProducts,
  getRelatedProducts,
} from "@/features/catalog/data/public-catalog-queries";
import { parseCatalogSearchParams } from "@/features/catalog/domain/catalog-query";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeLocalDatabase = (() => {
  if (!testDatabaseUrl) return false;
  const url = new URL(testDatabaseUrl);
  return ["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/jumbobox_test";
})();

describe.skipIf(!safeLocalDatabase).sequential("public catalog queries on PostgreSQL", () => {
  let pool: Pool;
  let nodeDb: NodePgDatabase<typeof schema>;
  let db: Database;
  let samsungId: string;
  let lgId: string;
  let mainboardId: string;
  let powerSupplyId: string;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl });
    nodeDb = drizzle(pool, { schema });
    db = nodeDb as unknown as Database;
  });

  beforeEach(async () => {
    await pool.query(`
      truncate table
        inventory_movements, inventory_items, product_compatibilities, product_images,
        products, locations, audit_logs, import_job_rows, import_jobs, brand_aliases,
        component_type_aliases, brands, component_types, session, account,
        verification, rate_limit, operational_rate_limits, "user"
      restart identity cascade
    `);
    await pool.query("alter sequence inventory_code_seq restart with 1");
    await seedDatabase(nodeDb);
    const [samsung, lg, mainboard, powerSupply] = await Promise.all([
      nodeDb.query.brands.findFirst({ where: eq(brands.code, "SAM") }),
      nodeDb.query.brands.findFirst({ where: eq(brands.code, "LG") }),
      nodeDb.query.componentTypes.findFirst({ where: eq(componentTypes.code, "MB") }),
      nodeDb.query.componentTypes.findFirst({ where: eq(componentTypes.code, "PSU") }),
    ]);
    if (!samsung || !lg || !mainboard || !powerSupply) throw new Error("Seed missing");
    samsungId = samsung.id;
    lgId = lg.id;
    mainboardId = mainboard.id;
    powerSupplyId = powerSupply.id;
  });

  afterAll(async () => pool?.end());

  async function addProduct(input: {
    ordinal: number;
    brandId?: string;
    typeId?: string;
    status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
    isPublic?: boolean;
    deleted?: boolean;
    partNumber?: string;
    title?: string;
    price?: string | null;
    model?: string;
  }) {
    const suffix = String(input.ordinal).padStart(3, "0");
    const partNumber = input.partNumber ?? `PART-${suffix}`;
    const [product] = await nodeDb
      .insert(products)
      .values({
        sku: `TEST-MB-${suffix}`,
        slug: `test-product-${suffix}`,
        brandId: input.brandId ?? samsungId,
        componentTypeId: input.typeId ?? mainboardId,
        partNumber,
        normalizedPartNumber: partNumber.replace(/[^A-Z0-9]/giu, "").toUpperCase(),
        title: input.title ?? `Producto técnico ${suffix}`,
        description: `Descripción pública ${suffix}`,
        salePrice: input.price === undefined ? "100.00" : input.price,
        currency: "MXN",
        status: input.status ?? "ACTIVE",
        isPublic: input.isPublic ?? true,
        deletedAt: input.deleted ? new Date() : null,
      })
      .returning();
    if (!product) throw new Error("Product insert failed");
    if (input.model) {
      await nodeDb.insert(productCompatibilities).values({
        productId: product.id,
        brandId: input.brandId ?? samsungId,
        model: input.model,
        normalizedModel: input.model.replace(/[^A-Z0-9]/giu, "").toUpperCase(),
        notes: "NOTA_INTERNA_NO_PUBLICAR",
      });
    }
    return product;
  }

  async function addInventory(
    productId: string,
    quantity: number,
    status: "AVAILABLE" | "RESERVED" | "SOLD" | "DAMAGED" | "SCRAPPED",
    condition: "NEW" | "USED_EXCELLENT" | "USED_GOOD" | "USED_FAIR" | "FOR_PARTS" | "UNKNOWN" = "UNKNOWN",
  ) {
    await nodeDb.insert(inventoryItems).values({
      productId,
      quantity,
      status,
      condition,
      acquisitionSource: "FUENTE_PRIVADA",
      purchaseCost: "9999.00",
      notes: "NOTA_PRIVADA",
      legacyBagNumber: "BOLSA_SECRETA",
      legacyLocationCode: "CAJA_SECRETA",
    });
  }

  it("enforces visibility at SQL level and returns explicit leak-free DTOs", async () => {
    const visible = await addProduct({ ordinal: 1, model: "UN55NU7100" });
    await addInventory(visible.id, 3, "AVAILABLE", "USED_GOOD");
    await addProduct({ ordinal: 2, status: "DRAFT" });
    await addProduct({ ordinal: 3, isPublic: false });
    await addProduct({ ordinal: 4, status: "ARCHIVED" });
    await addProduct({ ordinal: 5, deleted: true });

    const catalog = await getPublicProducts(db, { sort: "recientes", page: 1 });
    expect(catalog.total).toBe(1);
    expect(catalog.products[0]).toMatchObject({
      slug: visible.slug,
      availability: { key: "IN_STOCK" },
      conditions: ["USED_GOOD"],
    });
    const serialized = JSON.stringify(catalog);
    for (const secret of [
      "FUENTE_PRIVADA",
      "9999.00",
      "NOTA_PRIVADA",
      "BOLSA_SECRETA",
      "CAJA_SECRETA",
      "locationId",
      "availableStock",
      "productId",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    await expect(getPublicProductBySlug(db, "test-product-002")).resolves.toBeNull();
    await expect(getPublicProductBySlug(db, "test-product-003")).resolves.toBeNull();
    await expect(getPublicProductBySlug(db, "test-product-004")).resolves.toBeNull();
    await expect(getPublicProductBySlug(db, "test-product-005")).resolves.toBeNull();
  });

  it("searches SKU, part number, model, brand and type while excluding private matches", async () => {
    await addProduct({
      ordinal: 10,
      partNumber: "BN94-07820F",
      title: "Mainboard Samsung",
      model: "UN55NU7100FXZX",
    });
    await addProduct({ ordinal: 11, brandId: lgId, typeId: powerSupplyId, title: "Fuente LG" });
    await addProduct({ ordinal: 12, title: "BN94 privada", isPublic: false });

    for (const term of ["TEST-MB-010", "BN94-07820F", "UN55NU7100", "Samsung", "Mainboard"]) {
      const result = await getPublicProducts(db, parseCatalogSearchParams({ q: term }));
      expect(result.products.map(({ slug }) => slug)).toContain("test-product-010");
      expect(result.products.map(({ slug }) => slug)).not.toContain("test-product-012");
    }
    const exact = await getPublicProducts(db, parseCatalogSearchParams({ q: "TEST-MB-010" }));
    expect(exact.products[0]?.slug).toBe("test-product-010");
    await expect(
      getPublicProducts(db, parseCatalogSearchParams({ q: "NO-EXISTE-999" })),
    ).resolves.toMatchObject({ total: 0, products: [] });
  });

  it("filters saleable availability, condition and price without counting reserved or damaged units", async () => {
    const available = await addProduct({ ordinal: 20, price: "100.00" });
    const low = await addProduct({ ordinal: 21, typeId: powerSupplyId, price: "200.00" });
    const reservedOnly = await addProduct({ ordinal: 22, brandId: lgId, price: null });
    const damagedOnly = await addProduct({ ordinal: 23, brandId: lgId, price: "300.00" });
    await addInventory(available.id, 3, "AVAILABLE", "NEW");
    await addInventory(low.id, 2, "AVAILABLE", "USED_GOOD");
    await addInventory(low.id, 10, "RESERVED", "NEW");
    await addInventory(reservedOnly.id, 4, "RESERVED", "NEW");
    await addInventory(damagedOnly.id, 5, "DAMAGED", "FOR_PARTS");

    const inStock = await getPublicProducts(db, parseCatalogSearchParams({ disponibilidad: "disponible" }));
    expect(inStock.products.map(({ slug }) => slug)).toEqual([available.slug]);
    const scarce = await getPublicProducts(db, parseCatalogSearchParams({ disponibilidad: "pocas" }));
    expect(scarce.products.map(({ slug }) => slug)).toEqual([low.slug]);
    const soldOut = await getPublicProducts(db, parseCatalogSearchParams({ disponibilidad: "agotado" }));
    expect(soldOut.products.map(({ slug }) => slug)).toEqual(expect.arrayContaining([reservedOnly.slug, damagedOnly.slug]));
    const condition = await getPublicProducts(db, parseCatalogSearchParams({ condicion: "USED_GOOD" }));
    expect(condition.products.map(({ slug }) => slug)).toEqual([low.slug]);
    const price = await getPublicProducts(db, parseCatalogSearchParams({ precioMin: "150", precioMax: "250" }));
    expect(price.products.map(({ slug }) => slug)).toEqual([low.slug]);
    const combined = await getPublicProducts(
      db,
      parseCatalogSearchParams({ marca: "samsung", tipo: "mainboard", disponibilidad: "disponible", precioMax: "150" }),
    );
    expect(combined.products.map(({ slug }) => slug)).toEqual([available.slug]);
  });

  it("paginates 24 records and exposes only brands and types backed by public products", async () => {
    for (let ordinal = 100; ordinal < 125; ordinal += 1) await addProduct({ ordinal });
    await addProduct({ ordinal: 130, brandId: lgId, typeId: powerSupplyId, isPublic: false });

    const pageOne = await getPublicProducts(db, { sort: "nombre-asc", page: 1 });
    const pageTwo = await getPublicProducts(db, { sort: "nombre-asc", page: 2 });
    expect(pageOne).toMatchObject({ total: 25, pageCount: 2 });
    expect(pageOne.products).toHaveLength(24);
    expect(pageTwo.products).toHaveLength(1);
    const outOfRange = await getPublicProducts(db, { sort: "nombre-asc", page: 999 });
    expect(outOfRange).toMatchObject({ page: 2, pageCount: 2 });
    expect(outOfRange.products).toHaveLength(1);
    expect((await getPublicBrands(db)).map(({ slug }) => slug)).toEqual(["samsung"]);
    expect((await getPublicComponentTypes(db)).map(({ slug }) => slug)).toEqual(["mainboard"]);
  });

  it("loads complete public detail and keeps related products public", async () => {
    const current = await addProduct({ ordinal: 200, model: "MODEL-X" });
    await addInventory(current.id, 1, "AVAILABLE", "USED_EXCELLENT");
    await addProduct({ ordinal: 201, model: "MODEL-X" });
    await addProduct({ ordinal: 202, model: "MODEL-X", isPublic: false });
    const detail = await getPublicProductBySlug(db, current.slug);
    expect(detail).toMatchObject({
      slug: current.slug,
      availability: { key: "LOW_STOCK" },
      compatibilities: [{ brand: "Samsung", model: "MODEL-X" }],
    });
    if (!detail) throw new Error("Detail missing");
    const related = await getRelatedProducts(db, detail);
    expect(related.map(({ slug }) => slug)).toContain("test-product-201");
    expect(related.map(({ slug }) => slug)).not.toContain("test-product-202");
    expect(related.map(({ slug }) => slug)).not.toContain(current.slug);
  });
});
