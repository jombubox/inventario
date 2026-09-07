import { HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { and, asc, count, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { deflateSync } from "node:zlib";
import { pathToFileURL } from "node:url";

import { createDatabaseClient, type Database } from "@/db/connection";
import {
  account,
  auditLogs,
  brands,
  componentTypes,
  inventoryItems,
  inventoryMovements,
  locations,
  productImages,
  products,
  session,
  user,
} from "@/db/schema";
import { listAdminProducts } from "@/features/products/data/admin-product-queries";
import {
  getPublicProductBySlug,
  getPublicProducts,
} from "@/features/catalog/data/public-catalog-queries";
import {
  permissionMatrix,
  permissionValues,
} from "@/features/auth/domain/permissions";
import type { AuthenticatedUser } from "@/features/auth/server/authorization";
import {
  createProductImage,
  deleteProductImage,
  reorderProductImages,
  R2_IMAGE_PROVIDER,
  updateProductImage,
} from "@/features/images/server/image-service";
import { getR2PublicUrl } from "@/features/images/server/r2-public-url";
import { createR2Storage, type ImageStorage } from "@/features/images/server/r2";
import {
  adjustInventoryQuantity,
  createInventoryItem,
  moveInventoryItem,
  updateInventoryDetails,
} from "@/features/inventory/server/inventory-service";
import { createLocation } from "@/features/locations/server/location-service";
import { createProduct, updateProduct } from "@/features/products/server/product-service";
import { createJombuBoxAuth } from "@/lib/auth-factory";
import { parseServerEnv, type ServerEnv } from "@/lib/env-schema";
import { toBrandRecord, toComponentTypeRecord } from "@/validators/catalog";
import { createUserInputSchema } from "@/validators/auth";

const SAMPLE_PREFIX = "JombuBox Sample \u2014";
const SAMPLE_LOCATION_MARKER = "JombuBox production sample location";

const SAMPLE_PRODUCTS = [
  {
    title: `${SAMPLE_PREFIX} Mainboard Samsung`,
    brand: { name: "Samsung", code: "SAM" },
    componentType: { name: "Mainboard", code: "MB" },
    partNumber: "SAMPLE-MB-001",
    model: "SAMPLE55MB001",
    description: "Mainboard Samsung de muestra para presentar el cat\u00e1logo inicial de JombuBox.",
    salePrice: "1299.00",
    purchaseCost: "620.00",
    stock: 10,
    condition: "USED_EXCELLENT" as const,
    location: { code: "SAMPLE-A-01", name: "Caja A-01" },
    color: [18, 93, 128] as const,
  },
  {
    title: `${SAMPLE_PREFIX} Fuente LG`,
    brand: { name: "LG", code: "LG" },
    componentType: { name: "Fuente", code: "PSU" },
    partNumber: "SAMPLE-PSU-002",
    model: "SAMPLE55PSU002",
    description: "Fuente de poder LG de muestra con inventario bajo para presentar el cat\u00e1logo.",
    salePrice: "849.00",
    purchaseCost: "350.00",
    stock: 2,
    condition: "USED_GOOD" as const,
    location: { code: "SAMPLE-B-02", name: "Caja B-02" },
    color: [92, 64, 153] as const,
  },
  {
    title: `${SAMPLE_PREFIX} T-Con Sony`,
    brand: { name: "Sony", code: "SNY" },
    componentType: { name: "T-Con", code: "TCON" },
    partNumber: "SAMPLE-TCON-003",
    model: "SAMPLE55TCON003",
    description: "Tarjeta T-Con Sony de muestra con existencia m\u00ednima para presentar el cat\u00e1logo.",
    salePrice: "699.00",
    purchaseCost: "280.00",
    stock: 1,
    condition: "USED_FAIR" as const,
    location: { code: "SAMPLE-C-03", name: "Caja C-03" },
    color: [172, 65, 66] as const,
  },
] as const;

type BootstrapAdminInput = {
  name: string;
  email: string;
  password: string;
  role: "ADMIN";
};

type SampleProductRow = {
  id: string;
  title: string;
  sku: string;
  slug: string;
  stock: number;
  location: string | null;
  imageCount: number;
};

function hasProductionConfirmation(): boolean {
  return process.argv.includes("--confirm-production");
}

function databaseName(databaseUrl: string): string {
  const name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\/+|\/+$/gu, ""));
  return name || "<default>";
}

function printWriteContext(environment: ServerEnv, adminEmail: string, action: "bootstrap" | "remove-samples") {
  console.info(`Environment: ${environment.APP_ENV}`);
  console.info(`Database: ${databaseName(environment.DATABASE_URL)}`);
  console.info(`Admin email: ${adminEmail}`);
  console.info(`Products to ${action === "bootstrap" ? "ensure" : "remove"}: 3`);
}

function requireProductionConfirmation(environment: ServerEnv): void {
  if (environment.APP_ENV === "production" && !hasProductionConfirmation()) {
    throw new Error("Production writes require --confirm-production.");
  }
}

function parseBootstrapAdmin(environment: ServerEnv): BootstrapAdminInput {
  const input = createUserInputSchema.parse({
    name: environment.ADMIN_BOOTSTRAP_NAME,
    email: environment.ADMIN_BOOTSTRAP_EMAIL,
    password: environment.ADMIN_BOOTSTRAP_PASSWORD,
    role: "ADMIN",
  });
  if (input.password.length < 16) {
    throw new Error("ADMIN_BOOTSTRAP_PASSWORD must contain at least 16 characters.");
  }
  return { ...input, role: "ADMIN" };
}

function parseBootstrapEmail(environment: ServerEnv): string {
  return createUserInputSchema.shape.email.parse(environment.ADMIN_BOOTSTRAP_EMAIL);
}

function cookieHeader(responseHeaders: Headers): string {
  const withGetSetCookie = responseHeaders as Headers & { getSetCookie?: () => string[] };
  const values = withGetSetCookie.getSetCookie?.() ?? [responseHeaders.get("set-cookie") ?? ""];
  return values.filter(Boolean).map((value) => value.split(";", 1)[0]).join("; ");
}

async function ensureBootstrapAdmin(
  db: Database,
  auth: ReturnType<typeof createJombuBoxAuth>,
  input: BootstrapAdminInput,
) {
  let matching = await db
    .select()
    .from(user)
    .where(sql`lower(${user.email}) = ${input.email}`);
  if (matching.length > 1) throw new Error("Multiple users match ADMIN_BOOTSTRAP_EMAIL.");

  const created = matching.length === 0;
  if (created) {
    await auth.api.createUser({ body: input });
    matching = await db
      .select()
      .from(user)
      .where(sql`lower(${user.email}) = ${input.email}`);
  }

  let admin = matching[0];
  if (!admin || admin.role !== "ADMIN" || !admin.active || admin.banned) {
    throw new Error("The configured bootstrap user must be an active, unbanned ADMIN.");
  }

  let signInResult: Awaited<ReturnType<typeof auth.api.signInEmail>>;
  let authHeaders: Headers;
  try {
    const result = await auth.api.signInEmail({
      body: { email: input.email, password: input.password },
      headers: new Headers({ "user-agent": "JombuBox production bootstrap" }),
      returnHeaders: true,
    });
    signInResult = result.response;
    authHeaders = new Headers({
      cookie: cookieHeader(result.headers),
      "user-agent": "JombuBox production bootstrap",
    });
  } catch {
    throw new Error(
      "The existing ADMIN password does not match ADMIN_BOOTSTRAP_PASSWORD; use an authenticated Better Auth administrator to reset it safely.",
    );
  }

  if (admin.name !== input.name) {
    await auth.api.updateUser({ body: { name: input.name }, headers: authHeaders });
  }
  await auth.api.setUserPassword({
    body: { userId: admin.id, newPassword: input.password },
    headers: authHeaders,
  });

  const credential = await db.query.account.findFirst({
    where: and(eq(account.userId, admin.id), eq(account.providerId, "credential")),
  });
  if (!credential?.password || credential.password === input.password) {
    throw new Error("Better Auth did not store a secure credential for the bootstrap ADMIN.");
  }

  if (signInResult.token) {
    await db.delete(session).where(eq(session.token, signInResult.token));
  }
  admin = await db.query.user.findFirst({ where: eq(user.id, admin.id) });
  if (!admin || admin.name !== input.name || admin.role !== "ADMIN") {
    throw new Error("Bootstrap ADMIN synchronization failed.");
  }
  if (permissionMatrix.ADMIN.length !== permissionValues.length) {
    throw new Error("ADMIN does not have the complete application permission set.");
  }

  return { admin, created, loginVerified: true };
}

async function ensureBrand(db: Database, definition: { name: string; code: string }) {
  const record = toBrandRecord(definition);
  let matching = await db
    .select()
    .from(brands)
    .where(or(eq(brands.code, record.code), eq(brands.normalizedName, record.normalizedName)));
  if (matching.length > 1) throw new Error(`Conflicting brand reference data for ${definition.name}.`);
  if (matching.length === 0) {
    await db.insert(brands).values(record).onConflictDoNothing();
    matching = await db
      .select()
      .from(brands)
      .where(or(eq(brands.code, record.code), eq(brands.normalizedName, record.normalizedName)));
  }
  const brand = matching[0];
  if (!brand?.active) throw new Error(`Brand is missing or inactive: ${definition.name}.`);
  return brand;
}

async function ensureComponentType(db: Database, definition: { name: string; code: string }) {
  const record = toComponentTypeRecord(definition);
  let matching = await db
    .select()
    .from(componentTypes)
    .where(
      or(
        eq(componentTypes.code, record.code),
        eq(componentTypes.normalizedName, record.normalizedName),
      ),
    );
  if (matching.length > 1) {
    throw new Error(`Conflicting component reference data for ${definition.name}.`);
  }
  if (matching.length === 0) {
    await db.insert(componentTypes).values(record).onConflictDoNothing();
    matching = await db
      .select()
      .from(componentTypes)
      .where(
        or(
          eq(componentTypes.code, record.code),
          eq(componentTypes.normalizedName, record.normalizedName),
        ),
      );
  }
  const componentType = matching[0];
  if (!componentType?.active) {
    throw new Error(`Component type is missing or inactive: ${definition.name}.`);
  }
  return componentType;
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

function createSamplePng(color: readonly [number, number, number], variant: number): Uint8Array {
  const width = 1000;
  const height = 1000;
  const pixels = new Uint8Array((width * 3 + 1) * height);
  const setPixel = (x: number, y: number, rgb: readonly [number, number, number]) => {
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    pixels[offset] = rgb[0];
    pixels[offset + 1] = rgb[1];
    pixels[offset + 2] = rgb[2];
  };
  const rectangle = (
    startX: number,
    startY: number,
    rectangleWidth: number,
    rectangleHeight: number,
    rgb: readonly [number, number, number],
  ) => {
    for (let y = startY; y < startY + rectangleHeight; y += 1) {
      for (let x = startX; x < startX + rectangleWidth; x += 1) setPixel(x, y, rgb);
    }
  };

  for (let y = 0; y < height; y += 1) {
    pixels[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const shade = Math.round(((x + y) / (width + height)) * 35);
      setPixel(x, y, [
        Math.min(255, color[0] + shade),
        Math.min(255, color[1] + shade),
        Math.min(255, color[2] + shade),
      ]);
    }
  }
  rectangle(120, 120, 760, 760, [255, 255, 255]);
  rectangle(160, 160, 680, 680, color);
  rectangle(275, 280, 70, 310, [255, 255, 255]);
  rectangle(205, 520, 140, 70, [255, 255, 255]);
  rectangle(205, 520, 70, 140, [255, 255, 255]);
  rectangle(470, 280, 70, 380, [255, 255, 255]);
  rectangle(540, 280, 135, 70, [255, 255, 255]);
  rectangle(540, 445, 135, 70, [255, 255, 255]);
  rectangle(540, 590, 135, 70, [255, 255, 255]);
  rectangle(675, 330, 70, 115, [255, 255, 255]);
  rectangle(675, 515, 70, 75, [255, 255, 255]);
  for (let index = 0; index < variant; index += 1) {
    rectangle(360 + index * 95, 740, 65, 18, [255, 255, 255]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

async function ensureLocation(
  db: Database,
  actor: AuthenticatedUser,
  definition: { code: string; name: string },
) {
  let location = await db.query.locations.findFirst({
    where: eq(locations.code, definition.code),
  });
  if (!location) {
    location = await createLocation(db, actor, {
      ...definition,
      type: "BOX",
      parentId: null,
      active: true,
      notes: SAMPLE_LOCATION_MARKER,
    });
  }
  if (!location.active) throw new Error(`Sample location is inactive: ${definition.code}.`);
  return location;
}

async function ensureSampleProducts(
  db: Database,
  actor: AuthenticatedUser,
  storage: ImageStorage,
) {
  const existingSamples = await db
    .select({ id: products.id, title: products.title })
    .from(products)
    .where(and(ilike(products.title, `${SAMPLE_PREFIX}%`), isNull(products.deletedAt)));
  const expectedNames = new Set<string>(SAMPLE_PRODUCTS.map(({ title }) => title));
  const unexpected = existingSamples.filter(({ title }) => !expectedNames.has(title));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected JombuBox sample products exist: ${unexpected.map(({ title }) => title).join(", ")}`);
  }

  const ensured: SampleProductRow[] = [];
  let imagesUploaded = 0;
  for (const [index, definition] of SAMPLE_PRODUCTS.entries()) {
    const [brand, componentType, location] = await Promise.all([
      ensureBrand(db, definition.brand),
      ensureComponentType(db, definition.componentType),
      ensureLocation(db, actor, definition.location),
    ]);
    const productInput = {
      brandId: brand.id,
      componentTypeId: componentType.id,
      partNumber: definition.partNumber,
      title: definition.title,
      description: definition.description,
      salePrice: definition.salePrice,
      currency: "MXN",
      status: "ACTIVE" as const,
      isPublic: true,
      compatibilities: [{
        brandId: brand.id,
        model: definition.model,
        notes: "JombuBox production sample",
      }],
    };
    let product = await db.query.products.findFirst({
      where: and(eq(products.title, definition.title), isNull(products.deletedAt)),
    });
    if (!product) {
      product = await createProduct(db, actor, productInput);
    } else {
      if (
        product.brandId !== brand.id ||
        product.componentTypeId !== componentType.id ||
        product.partNumber !== definition.partNumber
      ) {
        throw new Error(`Existing sample identity is inconsistent: ${definition.title}.`);
      }
      product = await updateProduct(db, actor, {
        ...productInput,
        id: product.id,
        expectedUpdatedAt: product.updatedAt,
      });
    }

    let inventoryRows = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, product.id))
      .orderBy(asc(inventoryItems.createdAt));
    if (inventoryRows.length > 1) {
      throw new Error(`Sample product has multiple inventory records: ${definition.title}.`);
    }
    let inventory = inventoryRows[0];
    if (!inventory) {
      inventory = await createInventoryItem(db, actor, {
        productId: product.id,
        locationId: location.id,
        quantity: definition.stock,
        condition: definition.condition,
        status: "AVAILABLE",
        acquiredAt: null,
        acquisitionSource: "Production catalog bootstrap",
        purchaseCost: definition.purchaseCost,
        notes: "JombuBox production sample",
        legacyBagNumber: null,
        legacyLocationCode: definition.location.name,
      });
    } else {
      inventory = await updateInventoryDetails(db, actor, {
        id: inventory.id,
        expectedUpdatedAt: inventory.updatedAt,
        condition: definition.condition,
        acquiredAt: null,
        acquisitionSource: "Production catalog bootstrap",
        purchaseCost: definition.purchaseCost,
        notes: "JombuBox production sample",
        legacyBagNumber: null,
        legacyLocationCode: definition.location.name,
      });
      if (inventory.locationId !== location.id) {
        inventory = await moveInventoryItem(db, actor, {
          id: inventory.id,
          toLocationId: location.id,
          reason: "Production sample bootstrap synchronization",
        });
      }
      if (inventory.quantity === definition.stock && inventory.status !== "AVAILABLE") {
        inventory = await adjustInventoryQuantity(db, actor, {
          id: inventory.id,
          newQuantity: definition.stock + 1,
          newStatus: "AVAILABLE",
          reason: "Production sample bootstrap status repair",
        });
      }
      if (inventory.quantity !== definition.stock || inventory.status !== "AVAILABLE") {
        inventory = await adjustInventoryQuantity(db, actor, {
          id: inventory.id,
          newQuantity: definition.stock,
          newStatus: "AVAILABLE",
          reason: "Production sample bootstrap synchronization",
        });
      }
    }
    inventoryRows = [inventory];

    let images = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt));
    for (const extra of images.slice(1)) {
      await deleteProductImage(db, actor, storage, extra.id);
    }
    images = images.slice(0, 1);
    if (images.length === 0) {
      await createProductImage(db, actor, storage, {
        productId: product.id,
        filename: `${definition.partNumber.toLowerCase()}-sample.png`,
        mimeType: "image/png",
        bytes: createSamplePng(definition.color, index + 1),
        alt: definition.title,
      });
      imagesUploaded += 1;
      images = await db
        .select()
        .from(productImages)
        .where(eq(productImages.productId, product.id))
        .orderBy(asc(productImages.sortOrder));
    }
    const image = images[0];
    if (!image) throw new Error(`Sample image was not created: ${definition.title}.`);
    if (image.sortOrder !== 0) await reorderProductImages(db, actor, product.id, [image.id]);
    if (!image.isPrimary) {
      await updateProductImage(db, actor, { imageId: image.id, makePrimary: true });
    }
    if (image.alt !== definition.title) {
      await updateProductImage(db, actor, { imageId: image.id, alt: definition.title });
    }

    ensured.push({
      id: product.id,
      title: product.title,
      sku: product.sku,
      slug: product.slug,
      stock: inventory.quantity,
      location: location.name,
      imageCount: 1,
    });
  }
  return { products: ensured, imagesUploaded };
}

function createReadOnlyR2Client(environment: ServerEnv) {
  const required = {
    accountId: environment.CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: environment.R2_ACCESS_KEY_ID,
    secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
    bucketName: environment.R2_BUCKET_NAME,
    publicUrl: environment.R2_PUBLIC_URL,
  };
  if (Object.values(required).some((value) => !value)) {
    throw new Error("Cloudflare R2 bootstrap configuration is incomplete.");
  }
  const endpoint = /^https?:\/\//u.test(required.accountId!)
    ? required.accountId!.replace(/\/+$/u, "")
    : `https://${required.accountId}.r2.cloudflarestorage.com`;
  return {
    bucketName: required.bucketName!,
    client: new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: required.accessKeyId!,
        secretAccessKey: required.secretAccessKey!,
      },
    }),
  };
}

async function listObjectKeys(client: S3Client, bucketName: string, prefix: string) {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    keys.push(...(result.Contents ?? []).flatMap(({ Key }) => Key ? [Key] : []));
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function loadSampleRows(db: Database): Promise<SampleProductRow[]> {
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      sku: products.sku,
      slug: products.slug,
    })
    .from(products)
    .where(and(ilike(products.title, `${SAMPLE_PREFIX}%`), isNull(products.deletedAt)))
    .orderBy(asc(products.title));
  return Promise.all(rows.map(async (product) => {
    const [stockResult, locationResult, imageResult] = await Promise.all([
      db.select({ value: sql<number>`coalesce(sum(${inventoryItems.quantity}), 0)::int` })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.productId, product.id), eq(inventoryItems.status, "AVAILABLE"))),
      db.select({ name: locations.name })
        .from(inventoryItems)
        .innerJoin(locations, eq(inventoryItems.locationId, locations.id))
        .where(eq(inventoryItems.productId, product.id))
        .limit(1),
      db.select({ value: count() })
        .from(productImages)
        .where(eq(productImages.productId, product.id)),
    ]);
    return {
      ...product,
      stock: stockResult[0]?.value ?? 0,
      location: locationResult[0]?.name ?? null,
      imageCount: imageResult[0]?.value ?? 0,
    };
  }));
}

async function verifyBootstrapState(db: Database, environment: ServerEnv, adminEmail: string) {
  const adminRows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, banned: user.banned })
    .from(user)
    .where(sql`lower(${user.email}) = ${adminEmail}`);
  const sampleRows = await loadSampleRows(db);
  const expectedNames = new Set<string>(SAMPLE_PRODUCTS.map(({ title }) => title));
  const imageRows = sampleRows.length === 0
    ? []
    : await db.select().from(productImages).where(inArray(productImages.productId, sampleRows.map(({ id }) => id)));
  const duplicateSkus = await db
    .select({ value: count() })
    .from(products)
    .where(and(ilike(products.title, `${SAMPLE_PREFIX}%`), isNull(products.deletedAt)))
    .groupBy(products.sku)
    .having(sql`count(*) > 1`);
  const duplicateSlugs = await db
    .select({ value: count() })
    .from(products)
    .where(and(ilike(products.title, `${SAMPLE_PREFIX}%`), isNull(products.deletedAt)))
    .groupBy(products.slug)
    .having(sql`count(*) > 1`);
  const adminCatalog = await listAdminProducts(db, {
    q: "JombuBox Sample",
    page: 1,
    pageSize: 20,
    sort: "title",
    direction: "asc",
  });
  const publicCatalog = await getPublicProducts(db, {
    q: "JombuBox Sample",
    sort: "nombre-asc",
    page: 1,
  });
  const details = await Promise.all(sampleRows.map(({ slug }) => getPublicProductBySlug(db, slug)));
  const compatibilitySearches = await Promise.all(SAMPLE_PRODUCTS.map(({ model }) =>
    getPublicProducts(db, { modelo: model, sort: "recientes", page: 1 })));

  const r2 = createReadOnlyR2Client(environment);
  let deliveredImages = 0;
  const databaseKeys = new Set<string>();
  for (const image of imageRows) {
    if (
      image.provider !== R2_IMAGE_PROVIDER ||
      !image.storageKey ||
      image.url !== null ||
      image.externalId !== null
    ) {
      throw new Error(`Invalid sample product image row: ${image.id}.`);
    }
    databaseKeys.add(image.storageKey);
    const head = await r2.client.send(new HeadObjectCommand({
      Bucket: r2.bucketName,
      Key: image.storageKey,
    }));
    if (!head.ContentType?.startsWith("image/")) {
      throw new Error(`R2 object is not an image: ${image.storageKey}.`);
    }
    const response = await fetch(getR2PublicUrl(image.storageKey, environment.R2_PUBLIC_URL));
    const contentType = response.headers.get("content-type") ?? "";
    await response.arrayBuffer();
    if (response.status !== 200 || !contentType.startsWith("image/")) {
      throw new Error(`Public R2 delivery failed: ${image.storageKey}.`);
    }
    deliveredImages += 1;
  }
  const objectKeys = new Set<string>();
  for (const product of sampleRows) {
    const keys = await listObjectKeys(r2.client, r2.bucketName, `products/${product.sku}/`);
    for (const key of keys) objectKeys.add(key);
  }
  r2.client.destroy();
  const orphanObjects = [...objectKeys].filter((key) => !databaseKeys.has(key));

  const admin = adminRows[0];
  const ready =
    adminRows.length === 1 &&
    admin?.role === "ADMIN" &&
    admin.active &&
    !admin.banned &&
    sampleRows.length === 3 &&
    sampleRows.every(({ title, imageCount, stock }) => expectedNames.has(title) && imageCount === 1 && stock > 0) &&
    imageRows.length === 3 &&
    duplicateSkus.length === 0 &&
    duplicateSlugs.length === 0 &&
    adminCatalog.rows.length === 3 &&
    publicCatalog.products.length === 3 &&
    details.every((detail) => detail?.images.length === 1) &&
    compatibilitySearches.every(({ products: matches }) => matches.length === 1) &&
    objectKeys.size === 3 &&
    deliveredImages === 3 &&
    orphanObjects.length === 0;
  if (!ready) throw new Error("Production bootstrap verification failed.");

  return {
    admin: { name: admin.name, email: admin.email, role: admin.role },
    products: sampleRows,
    images: { rows: imageRows.length, objects: objectKeys.size, delivered: deliveredImages, orphanObjects: orphanObjects.length },
    catalog: { admin: adminCatalog.rows.length, public: publicCatalog.products.length, details: details.length, compatibilitySearches: compatibilitySearches.length },
    duplicates: { admin: adminRows.length - 1, products: sampleRows.length - expectedNames.size, images: imageRows.length - sampleRows.length },
  };
}

async function removeSampleProducts(
  db: Database,
  environment: ServerEnv,
  adminEmail: string,
  storage: ImageStorage,
) {
  const admin = await db.query.user.findFirst({
    where: and(sql`lower(${user.email}) = ${adminEmail}`, eq(user.role, "ADMIN"), eq(user.active, true)),
  });
  if (!admin) throw new Error("The configured active ADMIN is required for sample cleanup.");
  const actor: AuthenticatedUser = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: "ADMIN",
    active: true,
  };
  const sampleRows = await loadSampleRows(db);
  const productIds = sampleRows.map(({ id }) => id);
  const images = productIds.length === 0
    ? []
    : await db.select().from(productImages).where(inArray(productImages.productId, productIds));
  const inventory = productIds.length === 0
    ? []
    : await db.select({ id: inventoryItems.id }).from(inventoryItems).where(inArray(inventoryItems.productId, productIds));
  const r2 = createReadOnlyR2Client(environment);
  const allObjectKeys = new Set<string>();
  for (const product of sampleRows) {
    for (const key of await listObjectKeys(r2.client, r2.bucketName, `products/${product.sku}/`)) {
      allObjectKeys.add(key);
    }
  }
  r2.client.destroy();

  for (const image of images) {
    await deleteProductImage(db, actor, storage, image.id);
    if (image.storageKey) allObjectKeys.delete(image.storageKey);
  }
  for (const orphanKey of allObjectKeys) await storage.deleteObject(orphanKey);
  if (inventory.length > 0) {
    await db.delete(inventoryMovements).where(inArray(inventoryMovements.inventoryItemId, inventory.map(({ id }) => id)));
    await db.delete(inventoryItems).where(inArray(inventoryItems.id, inventory.map(({ id }) => id)));
  }
  const auditEntityIds = [...productIds, ...images.map(({ id }) => id), ...inventory.map(({ id }) => id)];
  if (auditEntityIds.length > 0) {
    await db.delete(auditLogs).where(inArray(auditLogs.entityId, auditEntityIds));
  }
  if (productIds.length > 0) await db.delete(products).where(inArray(products.id, productIds));

  for (const definition of SAMPLE_PRODUCTS) {
    const location = await db.query.locations.findFirst({
      where: and(eq(locations.code, definition.location.code), eq(locations.notes, SAMPLE_LOCATION_MARKER)),
    });
    if (!location) continue;
    const references = await db.select({ value: count() }).from(inventoryItems).where(eq(inventoryItems.locationId, location.id));
    if ((references[0]?.value ?? 0) === 0) await db.delete(locations).where(eq(locations.id, location.id));
  }
  const remainingAdmin = await db.query.user.findFirst({ where: eq(user.id, admin.id) });
  if (!remainingAdmin) throw new Error("Sample cleanup unexpectedly removed the production ADMIN.");
  return { productsRemoved: sampleRows.length, imagesRemoved: images.length, orphanObjectsRemoved: allObjectKeys.size };
}

async function main(): Promise<void> {
  config({ path: ".env.local" });
  config({ path: ".env" });
  const environment = parseServerEnv(process.env);
  const command = process.argv[2];

  if (command === "verify") {
    const adminEmail = parseBootstrapEmail(environment);
    const db = createDatabaseClient(environment.DATABASE_URL);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`set transaction read only`);
      return verifyBootstrapState(
        tx as unknown as Database,
        environment,
        adminEmail,
      );
    });
    console.info("Production bootstrap:");
    console.info("Admin:");
    console.info(`Email: ${result.admin.email}`);
    console.info(`Exists: yes`);
    console.info(`Role: ${result.admin.role}`);
    console.info("Sample products:");
    console.info("Expected: 3");
    console.info(`Found: ${result.products.length}`);
    console.info("Images:");
    console.info("Expected: 3");
    console.info(`R2 reachable: ${result.images.objects === 3 ? "yes" : "no"}`);
    console.info(`Public delivery: ${result.images.delivered === 3 ? "yes" : "no"}`);
    console.info("Status: READY");
    return;
  }

  if (command === "bootstrap") {
    const adminInput = parseBootstrapAdmin(environment);
    printWriteContext(environment, adminInput.email, "bootstrap");
    requireProductionConfirmation(environment);
    const db = createDatabaseClient(environment.DATABASE_URL);
    const auth = createJombuBoxAuth(db, {
      secret: environment.BETTER_AUTH_SECRET,
      baseURL: environment.BETTER_AUTH_URL,
      siteURL: environment.NEXT_PUBLIC_SITE_URL,
      secureCookies: environment.APP_ENV === "production",
    });
    const storage = createR2Storage(environment);
    const adminResult = await ensureBootstrapAdmin(db, auth, adminInput);
    const productResult = await ensureSampleProducts(db, {
      id: adminResult.admin.id,
      name: adminResult.admin.name,
      email: adminResult.admin.email,
      role: "ADMIN",
      active: true,
    }, storage);
    const verified = await verifyBootstrapState(db, environment, adminInput.email);
    console.info(`Admin: ${adminResult.created ? "created" : "already exists and is valid"}.`);
    console.info(`Better Auth login: ${adminResult.loginVerified ? "PASS" : "FAIL"}`);
    console.info(`Products: ${verified.products.length}; images uploaded this run: ${productResult.imagesUploaded}.`);
    for (const product of verified.products) console.info(`${product.title}: ${product.sku}`);
    console.info("Status: READY");
    return;
  }

  if (command === "remove-samples") {
    const adminEmail = parseBootstrapEmail(environment);
    printWriteContext(environment, adminEmail, "remove-samples");
    requireProductionConfirmation(environment);
    const db = createDatabaseClient(environment.DATABASE_URL);
    const removed = await removeSampleProducts(db, environment, adminEmail, createR2Storage(environment));
    console.info(`Sample products removed: ${removed.productsRemoved}`);
    console.info(`Sample images removed: ${removed.imagesRemoved}`);
    console.info(`Orphan sample objects removed: ${removed.orphanObjectsRemoved}`);
    console.info("Production ADMIN: preserved");
    return;
  }

  throw new Error("Usage: production-bootstrap.ts bootstrap|verify|remove-samples");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
