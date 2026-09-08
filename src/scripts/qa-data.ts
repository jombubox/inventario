import { config } from "dotenv";
import { and, asc, count, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { deflateSync } from "node:zlib";

config({ path: ".env.local" });
config({ path: ".env" });

const QA_EMAIL = "admin.test@jombubox.local";
const QA_NAME = "JombuBox Test Admin";
const QA_PREFIX = "JombuBox QA \u2014";
const QA_LOCATION_CODES = ["QA-A-01", "QA-B-02", "QA-C-03"] as const;
const QA_ACTOR = {
  id: "system-qa-fixture",
  name: QA_NAME,
  email: QA_EMAIL,
  role: "ADMIN" as const,
  active: true as const,
};

const PRODUCT_FIXTURES = [
  {
    title: `${QA_PREFIX} Mainboard Samsung`,
    brandCode: "SAM",
    componentCode: "MB",
    partNumber: "QA-MB-2026",
    description: "Mainboard Samsung de prueba para validar b\u00fasqueda, filtros, detalle y galer\u00eda.",
    price: "1299.00",
    model: "QA55MB2026",
    locationCode: "QA-A-01",
    stock: 12,
    condition: "USED_EXCELLENT" as const,
    cost: "620.00",
    imageLabel: "MAINBOARD SAMSUNG",
    colors: [[18, 54, 92], [14, 139, 167]] as const,
  },
  {
    title: `${QA_PREFIX} Fuente LG`,
    brandCode: "LG",
    componentCode: "PSU",
    partNumber: "QA-PSU-2026",
    description: "Fuente de poder LG de prueba con existencia baja para validar avisos de inventario.",
    price: "849.00",
    model: "QA55PSU2026",
    locationCode: "QA-B-02",
    stock: 2,
    condition: "USED_GOOD" as const,
    cost: "350.00",
    imageLabel: "FUENTE LG",
    colors: [[69, 40, 120], [134, 75, 181]] as const,
  },
  {
    title: `${QA_PREFIX} T-Con Sony`,
    brandCode: "SNY",
    componentCode: "TCON",
    partNumber: "QA-TCON-2026",
    description: "Tarjeta T-Con Sony de prueba agotada para validar el estado sin existencias.",
    price: "699.00",
    model: "QA55TCON2026",
    locationCode: "QA-C-03",
    stock: 0,
    condition: "USED_FAIR" as const,
    cost: "280.00",
    imageLabel: "T-CON SONY",
    colors: [[112, 38, 45], [214, 91, 79]] as const,
  },
] as const;

function refuseProduction(environment: {
  APP_ENV: string;
  DATABASE_URL: string;
  BETTER_AUTH_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
}) {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const appUrls = [environment.BETTER_AUTH_URL, environment.NEXT_PUBLIC_SITE_URL].filter(
    (value): value is string => Boolean(value),
  );
  const databaseLabel = decodeURIComponent(environment.DATABASE_URL).toLowerCase();
  const productionMarker = /(?:^|[_.\-/])prod(?:uction)?(?:[_.\-/]|$)/u.test(databaseLabel);
  const nonLocalAppUrl = appUrls.some((value) => !localHosts.has(new URL(value).hostname));

  if (environment.APP_ENV !== "development" || productionMarker || nonLocalAppUrl) {
    throw new Error(
      "Refusing to create test products because the configured environment appears to be production.",
    );
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

const GLYPHS: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
};

function makeQaPng(
  label: string,
  imageNumber: number,
  colors: readonly (readonly [number, number, number])[],
): Uint8Array {
  const width = 800;
  const height = 800;
  const pixels = new Uint8Array((width * 3 + 1) * height);
  const color = colors[imageNumber - 1] ?? colors[0]!;
  const setPixel = (x: number, y: number, rgb: readonly [number, number, number]) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    pixels[offset] = rgb[0];
    pixels[offset + 1] = rgb[1];
    pixels[offset + 2] = rgb[2];
  };
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 3 + 1);
    pixels[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const shade = Math.round((x + y) / 1600 * 28);
      setPixel(x, y, [Math.min(255, color[0] + shade), Math.min(255, color[1] + shade), Math.min(255, color[2] + shade)]);
    }
  }
  const drawText = (text: string, centerY: number, scale: number) => {
    const normalized = text.toUpperCase();
    const totalWidth = normalized.length * 6 * scale - scale;
    let startX = Math.floor((width - totalWidth) / 2);
    for (const character of normalized) {
      const glyph = GLYPHS[character] ?? GLYPHS[" "]!;
      glyph.forEach((row, rowIndex) => {
        [...row].forEach((value, columnIndex) => {
          if (value !== "1") return;
          for (let dy = 0; dy < scale; dy += 1) {
            for (let dx = 0; dx < scale; dx += 1) {
              setPixel(startX + columnIndex * scale + dx, centerY + rowIndex * scale + dy, [255, 255, 255]);
            }
          }
        });
      });
      startX += 6 * scale;
    }
  };
  drawText("JOMBUBOX QA", 260, 10);
  drawText(label, 390, 7);
  drawText(`IMAGE ${imageNumber} / 2`, 500, 7);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

async function main() {
  if (process.env.APP_ENV === "production") {
    throw new Error(
      "Refusing to create test products because the configured environment appears to be production.",
    );
  }
  const [{ parseServerEnv }, { createDatabaseClient }, schema, seedModule, productService, locationService, inventoryService, imageService, r2Module, catalogQueries, adminQueries] = await Promise.all([
    import("@/lib/env-schema"),
    import("@/db/connection"),
    import("@/db/schema"),
    import("@/db/seed"),
    import("@/features/products/server/product-service"),
    import("@/features/locations/server/location-service"),
    import("@/features/inventory/server/inventory-service"),
    import("@/features/images/server/image-service"),
    import("@/features/images/server/r2"),
    import("@/features/catalog/data/public-catalog-queries"),
    import("@/features/products/data/admin-product-queries"),
  ]);
  const environment = parseServerEnv(process.env);
  refuseProduction(environment);
  const db = createDatabaseClient(environment.DATABASE_URL);
  const storage = r2Module.createR2Storage(environment);
  const action = process.argv[2] ?? "setup";

  if (action === "cleanup") {
    const qaProducts = await db.select({ id: schema.products.id }).from(schema.products).where(ilike(schema.products.title, `${QA_PREFIX}%`));
    for (const product of qaProducts) {
      const images = await db.select({ id: schema.productImages.id }).from(schema.productImages).where(eq(schema.productImages.productId, product.id));
      for (const image of images) await imageService.deleteProductImage(db, QA_ACTOR, storage, image.id);
      const items = await db.select({ id: schema.inventoryItems.id }).from(schema.inventoryItems).where(eq(schema.inventoryItems.productId, product.id));
      if (items.length > 0) {
        await db.delete(schema.inventoryMovements).where(inArray(schema.inventoryMovements.inventoryItemId, items.map((item) => item.id)));
        await db.delete(schema.inventoryItems).where(inArray(schema.inventoryItems.id, items.map((item) => item.id)));
      }
      await db.delete(schema.products).where(eq(schema.products.id, product.id));
    }
    await db.delete(schema.locations).where(inArray(schema.locations.code, [...QA_LOCATION_CODES]));
    console.info("JombuBox QA data removed.");
    return;
  }

  if (action !== "setup") throw new Error("Usage: qa-data.ts setup|cleanup");

  await seedModule.seedDatabase(
    db as unknown as Parameters<typeof seedModule.seedDatabase>[0],
  );

  const actor = QA_ACTOR;

  const locationDefinitions = [
    { code: "QA-A-01", name: "Caja A-01" },
    { code: "QA-B-02", name: "Caja B-02" },
    { code: "QA-C-03", name: "Caja C-03" },
  ] as const;
  const locationByCode = new Map<string, { id: string }>();
  for (const definition of locationDefinitions) {
    let location = await db.query.locations.findFirst({ where: eq(schema.locations.code, definition.code) });
    if (!location) {
      location = await locationService.createLocation(db, actor, {
        ...definition,
        type: "BOX",
        parentId: null,
        active: true,
        notes: "JombuBox QA fixture",
      });
    }
    locationByCode.set(definition.code, location);
  }

  const existingQaProducts = await db.select({ id: schema.products.id, title: schema.products.title }).from(schema.products).where(and(ilike(schema.products.title, `${QA_PREFIX}%`), isNull(schema.products.deletedAt)));
  const expectedTitles = new Set(PRODUCT_FIXTURES.map((fixture) => fixture.title));
  const unexpected = existingQaProducts.filter((product) => !expectedTitles.has(product.title as (typeof PRODUCT_FIXTURES)[number]["title"]));
  if (unexpected.length > 0) throw new Error(`Unexpected QA products exist: ${unexpected.map((product) => product.title).join(", ")}`);

  const completed = [];
  for (const fixture of PRODUCT_FIXTURES) {
    const [brand, componentType] = await Promise.all([
      db.query.brands.findFirst({ where: and(eq(schema.brands.code, fixture.brandCode), eq(schema.brands.active, true)) }),
      db.query.componentTypes.findFirst({ where: and(eq(schema.componentTypes.code, fixture.componentCode), eq(schema.componentTypes.active, true)) }),
    ]);
    if (!brand || !componentType) throw new Error(`Standard catalog reference missing for ${fixture.title}. Run pnpm db:seed.`);
    const productInput = {
      brandId: brand.id,
      componentTypeId: componentType.id,
      partNumber: fixture.partNumber,
      title: fixture.title,
      description: fixture.description,
      salePrice: fixture.price,
      currency: "MXN",
      status: "ACTIVE" as const,
      isPublic: true,
      compatibilities: [{ brandId: brand.id, model: fixture.model, notes: "JombuBox QA fixture" }],
    };
    let product = await db.query.products.findFirst({ where: and(eq(schema.products.title, fixture.title), isNull(schema.products.deletedAt)) });
    if (!product) product = await productService.createProduct(db, actor, productInput);
    else product = await productService.updateProduct(db, actor, { ...productInput, id: product.id, expectedUpdatedAt: product.updatedAt });

    const location = locationByCode.get(fixture.locationCode);
    if (!location) throw new Error(`QA location missing: ${fixture.locationCode}`);
    let inventory = await db.query.inventoryItems.findFirst({ where: eq(schema.inventoryItems.productId, product.id), orderBy: asc(schema.inventoryItems.createdAt) });
    if (!inventory) {
      inventory = await inventoryService.createInventoryItem(db, actor, {
        productId: product.id,
        locationId: location.id,
        quantity: fixture.stock === 0 ? 1 : fixture.stock,
        condition: fixture.condition,
        status: "AVAILABLE",
        acquiredAt: new Date("2026-09-01T00:00:00.000Z"),
        acquisitionSource: "QA manual testing",
        purchaseCost: fixture.cost,
        notes: "JombuBox QA fixture",
        legacyBagNumber: null,
        legacyLocationCode: fixture.locationCode.replace("QA-", "Caja ").replaceAll("-", "-"),
      });
    }
    if (inventory.locationId !== location.id && inventory.quantity > 0) {
      inventory = await inventoryService.moveInventoryItem(db, actor, { id: inventory.id, toLocationId: location.id, reason: "Sincronizaci\u00f3n de fixture QA" });
    }
    const desiredStatus = fixture.stock === 0 ? "SOLD" as const : "AVAILABLE" as const;
    if (inventory.quantity !== fixture.stock || inventory.status !== desiredStatus) {
      inventory = await inventoryService.adjustInventoryQuantity(db, actor, { id: inventory.id, newQuantity: fixture.stock, newStatus: desiredStatus, reason: "Sincronizaci\u00f3n de fixture QA" });
    }

    let images = await db.select().from(schema.productImages).where(eq(schema.productImages.productId, product.id)).orderBy(asc(schema.productImages.sortOrder), asc(schema.productImages.createdAt));
    for (const extra of images.slice(2)) await imageService.deleteProductImage(db, actor, storage, extra.id);
    images = images.slice(0, 2);
    for (let index = images.length; index < 2; index += 1) {
      await imageService.createProductImage(db, actor, storage, {
        productId: product.id,
        filename: `${fixture.partNumber.toLowerCase()}-${index + 1}.png`,
        mimeType: "image/png",
        bytes: makeQaPng(fixture.imageLabel, index + 1, fixture.colors),
        alt: `${fixture.title} \u2014 imagen ${index + 1}`,
      });
    }
    images = await db.select().from(schema.productImages).where(eq(schema.productImages.productId, product.id)).orderBy(asc(schema.productImages.sortOrder), asc(schema.productImages.createdAt));
    await imageService.reorderProductImages(db, actor, product.id, images.map((image) => image.id));
    if (!images[0]?.isPrimary) await imageService.updateProductImage(db, actor, { imageId: images[0]!.id, makePrimary: true });
    completed.push({ product, fixture });
  }

  const r2Endpoint = environment.CLOUDFLARE_ACCOUNT_ID && /^https?:\/\//u.test(environment.CLOUDFLARE_ACCOUNT_ID)
    ? environment.CLOUDFLARE_ACCOUNT_ID.replace(/\/+$/u, "")
    : `https://${environment.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const r2Client = new S3Client({ region: "auto", endpoint: r2Endpoint, forcePathStyle: true, credentials: { accessKeyId: environment.R2_ACCESS_KEY_ID!, secretAccessKey: environment.R2_SECRET_ACCESS_KEY! } });
  const imageRows = await db.select().from(schema.productImages).where(inArray(schema.productImages.productId, completed.map(({ product }) => product.id))).orderBy(asc(schema.productImages.productId), asc(schema.productImages.sortOrder));
  const delivery = [];
  for (const image of imageRows) {
    if (image.provider !== imageService.R2_IMAGE_PROVIDER || !image.storageKey || image.url !== null || image.externalId !== null) throw new Error(`Invalid R2 image representation: ${image.id}`);
    await r2Client.send(new HeadObjectCommand({ Bucket: environment.R2_BUCKET_NAME!, Key: image.storageKey }));
    const publicUrl = new URL(image.storageKey, `${environment.R2_PUBLIC_URL!.replace(/\/+$/u, "")}/`).href;
    const response = await fetch(publicUrl);
    const contentType = response.headers.get("content-type") ?? "";
    if (response.status !== 200 || !contentType.startsWith("image/")) throw new Error(`Public image delivery failed for ${image.storageKey}: ${response.status} ${contentType}`);
    delivery.push({ imageId: image.id, status: response.status, contentType });
  }

  const adminList = await adminQueries.listAdminProducts(db, { q: "JombuBox QA", page: 1, pageSize: 20, sort: "title", direction: "asc" });
  const publicList = await catalogQueries.getPublicProducts(db, { q: "JombuBox QA", sort: "nombre-asc", page: 1 });
  const details = await Promise.all(completed.map(({ product }) => catalogQueries.getPublicProductBySlug(db, product.slug)));
  const [{ value: qaProducts = 0 } = { value: 0 }] = await db.select({ value: count() }).from(schema.products).where(and(ilike(schema.products.title, `${QA_PREFIX}%`), isNull(schema.products.deletedAt)));
  const duplicateSkus = await db.select({ sku: schema.products.sku, value: count() }).from(schema.products).where(ilike(schema.products.title, `${QA_PREFIX}%`)).groupBy(schema.products.sku).having(sql`count(*) > 1`);
  const [{ value: orphanImages = 0 } = { value: 0 }] = await db.select({ value: count() }).from(schema.productImages).leftJoin(schema.products, eq(schema.productImages.productId, schema.products.id)).where(isNull(schema.products.id));
  if (qaProducts !== 3 || imageRows.length !== 6 || duplicateSkus.length !== 0 || orphanImages !== 0 || adminList.rows.length !== 3 || publicList.products.length !== 3 || details.some((detail) => !detail || detail.images.length !== 2)) {
    throw new Error("QA fixture validation failed.");
  }
  console.info(JSON.stringify({
    products: completed.map(({ product, fixture }) => ({ title: product.title, sku: product.sku, slug: product.slug, stock: fixture.stock, location: locationDefinitions.find((location) => location.code === fixture.locationCode)?.name, imageCount: 2 })),
    database: { qaProducts, qaImageRows: imageRows.length, duplicateSkus: duplicateSkus.length, orphanImages },
    services: { adminProducts: adminList.rows.length, publicProducts: publicList.products.length, productDetails: details.filter(Boolean).length, publicImageResponses: delivery.length },
  }, null, 2));
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
