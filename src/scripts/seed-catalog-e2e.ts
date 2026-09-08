import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { seedDatabase } from "@/db/seed";
import * as schema from "@/db/schema";
import {
  brands,
  componentTypes,
  inventoryItems,
  productCompatibilities,
  products,
} from "@/db/schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for E2E fixtures.");
const parsedUrl = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost"].includes(parsedUrl.hostname) ||
  parsedUrl.pathname !== "/jumbobox_test"
) {
  throw new Error("E2E fixtures may only reset local jumbobox_test.");
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool, { schema });

async function main() {
try {
  await pool.query(`
    truncate table
      inventory_movements, inventory_items, product_compatibilities, product_images,
      products, locations, audit_logs, import_job_rows, import_jobs, brand_aliases,
      component_type_aliases, brands, component_types, session, account,
      verification, rate_limit, operational_rate_limits, "user"
    restart identity cascade
  `);
  await pool.query("alter sequence inventory_code_seq restart with 1");
  await seedDatabase(db);

  const [samsung, lg, mainboard, powerSupply] = await Promise.all([
    db.query.brands.findFirst({ where: eq(brands.code, "SAM") }),
    db.query.brands.findFirst({ where: eq(brands.code, "LG") }),
    db.query.componentTypes.findFirst({ where: eq(componentTypes.code, "MB") }),
    db.query.componentTypes.findFirst({ where: eq(componentTypes.code, "PSU") }),
  ]);
  if (!samsung || !lg || !mainboard || !powerSupply) throw new Error("Catalog seed missing.");

  const [
    publicProduct,
    privateProduct,
    relatedProduct,
    modelOnlyProduct,
    exhaustedProduct,
    archivedProduct,
  ] = await db
    .insert(products)
    .values([
      {
        sku: "SAM-MB-BN9407820F",
        slug: "mainboard-bn94-07820f-samsung-un55nu7100",
        brandId: samsung.id,
        componentTypeId: mainboard.id,
        partNumber: "BN94-07820F",
        normalizedPartNumber: "BN9407820F",
        title: "Mainboard Samsung BN94-07820F",
        description: "Tarjeta principal para televisores Samsung compatibles.",
        salePrice: "1250.00",
        currency: "MXN",
        status: "ACTIVE" as const,
        isPublic: true,
      },
      {
        sku: "SAM-MB-BN94PRIVATE",
        slug: "mainboard-bn94-private",
        brandId: samsung.id,
        componentTypeId: mainboard.id,
        partNumber: "BN94-PRIVATE",
        normalizedPartNumber: "BN94PRIVATE",
        title: "Mainboard privada BN94",
        salePrice: "10.00",
        currency: "MXN",
        status: "ACTIVE" as const,
        isPublic: false,
      },
      {
        sku: "LG-PSU-EAY123456",
        slug: "fuente-lg-eay123456",
        brandId: lg.id,
        componentTypeId: powerSupply.id,
        partNumber: "EAY123456",
        normalizedPartNumber: "EAY123456",
        title: "Fuente LG EAY123456",
        salePrice: null,
        currency: "MXN",
        status: "ACTIVE" as const,
        isPublic: true,
      },
      {
        sku: "SAM-MB-UN50MODELONLY",
        slug: "mainboard-samsung-sin-numero-parte",
        brandId: samsung.id,
        componentTypeId: mainboard.id,
        partNumber: null,
        normalizedPartNumber: null,
        title: "Mainboard Samsung sin número de parte",
        description: "Fixture público identificado por modelos compatibles.",
        salePrice: "850.00",
        currency: "MXN",
        status: "ACTIVE" as const,
        isPublic: true,
      },
      {
        sku: "LG-PSU-EAYAGOTADA",
        slug: "fuente-lg-agotada",
        brandId: lg.id,
        componentTypeId: powerSupply.id,
        partNumber: "EAY-AGOTADA",
        normalizedPartNumber: "EAYAGOTADA",
        title: "Fuente LG agotada",
        description: "Fixture público sin unidades disponibles.",
        salePrice: "500.00",
        currency: "MXN",
        status: "ACTIVE" as const,
        isPublic: true,
      },
      {
        sku: "SAM-MB-ARCHIVADA",
        slug: "mainboard-samsung-archivada",
        brandId: samsung.id,
        componentTypeId: mainboard.id,
        partNumber: "ARCHIVADA",
        normalizedPartNumber: "ARCHIVADA",
        title: "Mainboard Samsung archivada",
        salePrice: "100.00",
        currency: "MXN",
        status: "ARCHIVED" as const,
        isPublic: false,
      },
    ])
    .returning();
  if (
    !publicProduct ||
    !privateProduct ||
    !relatedProduct ||
    !modelOnlyProduct ||
    !exhaustedProduct ||
    !archivedProduct
  ) {
    throw new Error("E2E products missing.");
  }

  await db.insert(productCompatibilities).values([
    {
      productId: publicProduct.id,
      brandId: samsung.id,
      model: "UN55NU7100FXZX",
      normalizedModel: "UN55NU7100FXZX",
      notes: "NO_PUBLICAR_E2E",
    },
    {
      productId: publicProduct.id,
      brandId: samsung.id,
      model: "UN58NU7100FXZX",
      normalizedModel: "UN58NU7100FXZX",
      notes: null,
    },
    {
      productId: relatedProduct.id,
      brandId: lg.id,
      model: "55UK6300",
      normalizedModel: "55UK6300",
      notes: null,
    },
    {
      productId: modelOnlyProduct.id,
      brandId: samsung.id,
      model: "UN50AU7000FXZX",
      normalizedModel: "UN50AU7000FXZX",
      notes: null,
    },
    {
      productId: modelOnlyProduct.id,
      brandId: samsung.id,
      model: "UN55AU7000FXZX",
      normalizedModel: "UN55AU7000FXZX",
      notes: null,
    },
  ]);
  await db.insert(inventoryItems).values([
    {
      productId: publicProduct.id,
      quantity: 2,
      status: "AVAILABLE",
      condition: "USED_GOOD",
      notes: "CAJA-E2E",
      legacyLocationCode: "CAJA-E2E",
    },
    {
      productId: publicProduct.id,
      quantity: 9,
      status: "RESERVED",
      condition: "NEW",
    },
    {
      productId: exhaustedProduct.id,
      quantity: 0,
      status: "SOLD",
      condition: "USED_GOOD",
    },
  ]);

  process.stdout.write("E2E catalog fixtures created in local jumbobox_test.\n");
} finally {
  await pool.end();
}
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
