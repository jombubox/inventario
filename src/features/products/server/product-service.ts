import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  brands,
  componentTypes,
  productCompatibilities,
  productSerialNumbers,
  products,
} from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
import { CUSTOM_CATALOG_VALUE } from "@/features/products/domain/catalog-selection";
import { isProductPublic } from "@/features/products/domain/public-product";
import { buildProductTitle } from "@/features/products/domain/build-product-title";
import {
  appendSkuCollisionSuffix,
  generateSku,
} from "@/features/products/domain/generate-sku";
import {
  normalizeModel,
  normalizePartNumber,
} from "@/features/products/domain/product-normalization";
import {
  cleanSerialNumber,
  findDuplicateSerialNumber,
  MAX_PRODUCT_SECONDARY_SERIALS,
  MAX_PRODUCT_SERIAL_LENGTH,
  normalizeSerialNumber,
} from "@/features/products/domain/serial-number";
import {
  resolveOrCreateBrand,
  resolveOrCreateComponentType,
} from "@/features/products/server/catalog-service";
import {
  appendSlugCollisionSuffix,
  generateProductSlug,
} from "@/features/products/domain/product-slug";
import {
  ConcurrentModificationError,
  DuplicateEntityError,
  EntityNotFoundError,
  InvalidOperationError,
} from "@/features/shared/domain/service-errors";
import type {
  CreateProductMutationInput,
  UpdateProductMutationInput,
} from "@/validators/admin-product";

type CatalogContext = {
  brand: { id: string; name: string; code: string };
  componentType: { id: string; name: string; code: string };
};

export type ProductTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function loadCatalogContext(
  db: Parameters<Parameters<Database["transaction"]>[0]>[0],
  input: Pick<
    CreateProductMutationInput,
    "brandId" | "customBrandName" | "componentTypeId" | "customComponentTypeName"
  >,
): Promise<CatalogContext> {
  const brand = input.brandId === CUSTOM_CATALOG_VALUE
    ? input.customBrandName
      ? await resolveOrCreateBrand(db, input.customBrandName)
      : null
    : await db.query.brands.findFirst({
      columns: { id: true, name: true, code: true },
      where: and(eq(brands.id, input.brandId), eq(brands.active, true)),
    });
  const componentType = input.componentTypeId === CUSTOM_CATALOG_VALUE
    ? input.customComponentTypeName
      ? await resolveOrCreateComponentType(db, input.customComponentTypeName)
      : null
    : await db.query.componentTypes.findFirst({
      columns: { id: true, name: true, code: true },
      where: and(
        eq(componentTypes.id, input.componentTypeId),
        eq(componentTypes.active, true),
      ),
    });

  if (!brand) {
    if (input.brandId === CUSTOM_CATALOG_VALUE) {
      throw new InvalidOperationError("Escribe el nombre de la nueva marca.");
    }
    throw new EntityNotFoundError("Brand not found or inactive.");
  }
  if (!componentType) {
    if (input.componentTypeId === CUSTOM_CATALOG_VALUE) {
      throw new InvalidOperationError("Escribe el nombre del nuevo tipo de pieza.");
    }
    throw new EntityNotFoundError("El tipo de pieza no existe o está inactivo.");
  }

  return { brand, componentType };
}

function normalizedCompatibilities(input: CreateProductMutationInput["compatibilities"]) {
  const normalized = input.map((compatibility) => ({
    ...compatibility,
    normalizedModel: normalizeModel(compatibility.model),
  }));
  const keys = normalized.map(
    (compatibility) => `${compatibility.brandId}:${compatibility.normalizedModel}`,
  );

  if (new Set(keys).size !== keys.length) {
    throw new DuplicateEntityError("A compatibility is repeated in this product.");
  }

  return normalized;
}

function normalizedSerials(
  input: Pick<
    CreateProductMutationInput,
    "primarySerialNumber" | "secondarySerialNumbers"
  >,
) {
  const primarySerialNumber = cleanSerialNumber(input.primarySerialNumber ?? "") || null;
  const secondarySerialNumbers = (input.secondarySerialNumbers ?? [])
    .map(cleanSerialNumber)
    .filter(Boolean);

  if (secondarySerialNumbers.length > MAX_PRODUCT_SECONDARY_SERIALS) {
    throw new InvalidOperationError(
      `A product can have at most ${MAX_PRODUCT_SECONDARY_SERIALS} secondary serial numbers.`,
    );
  }
  if (
    [primarySerialNumber, ...secondarySerialNumbers].some(
      (serialNumber) => serialNumber && serialNumber.length > MAX_PRODUCT_SERIAL_LENGTH,
    )
  ) {
    throw new InvalidOperationError(
      `Serial numbers can have at most ${MAX_PRODUCT_SERIAL_LENGTH} characters.`,
    );
  }

  const duplicate = findDuplicateSerialNumber(
    primarySerialNumber,
    secondarySerialNumbers,
  );
  if (duplicate) {
    throw new InvalidOperationError(
      `El número de serie ${duplicate} está repetido dentro de este producto.`,
    );
  }

  return { primarySerialNumber, secondarySerialNumbers };
}

async function replaceProductSerialNumbers(
  tx: ProductTransaction,
  productId: string,
  serials: ReturnType<typeof normalizedSerials>,
) {
  await tx
    .delete(productSerialNumbers)
    .where(eq(productSerialNumbers.productId, productId));

  const values = [
    ...(serials.primarySerialNumber
      ? [{
          productId,
          kind: "PRIMARY" as const,
          serialNumber: serials.primarySerialNumber,
          normalizedSerialNumber: normalizeSerialNumber(serials.primarySerialNumber),
          sortOrder: 0,
        }]
      : []),
    ...serials.secondarySerialNumbers.map((serialNumber, index) => ({
      productId,
      kind: "SECONDARY" as const,
      serialNumber,
      normalizedSerialNumber: normalizeSerialNumber(serialNumber),
      sortOrder: index,
    })),
  ];

  if (values.length > 0) await tx.insert(productSerialNumbers).values(values);
}

async function assertCompatibilityBrandsExist(
  db: Parameters<Parameters<Database["transaction"]>[0]>[0],
  brandIds: readonly string[],
): Promise<void> {
  const uniqueIds = [...new Set(brandIds)];
  if (uniqueIds.length === 0) return;

  const rows = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(inArray(brands.id, uniqueIds), eq(brands.active, true)));

  if (rows.length !== uniqueIds.length) {
    throw new EntityNotFoundError("One or more compatibility brands do not exist.");
  }
}

async function resolveAvailableSku(
  db: Parameters<Parameters<Database["transaction"]>[0]>[0],
  baseSku: string,
  identity: { brandId: string; componentTypeId: string; normalizedPartNumber: string | null },
): Promise<string> {
  let ordinal = 1;

  while (ordinal <= 99) {
    const candidate = ordinal === 1 ? baseSku : appendSkuCollisionSuffix(baseSku, ordinal);
    const collision = await db.query.products.findFirst({
      columns: {
        id: true,
        brandId: true,
        componentTypeId: true,
        normalizedPartNumber: true,
      },
      where: eq(products.sku, candidate),
    });

    if (!collision) return candidate;

    if (
      ordinal === 1 &&
      collision.brandId === identity.brandId &&
      collision.componentTypeId === identity.componentTypeId &&
      collision.normalizedPartNumber === identity.normalizedPartNumber
    ) {
      throw new DuplicateEntityError(
        `A product with the same identity already exists (${collision.id}).`,
      );
    }

    ordinal += 1;
  }

  throw new DuplicateEntityError("No available SKU suffix was found.");
}

async function resolveAvailableSlug(
  db: Parameters<Parameters<Database["transaction"]>[0]>[0],
  baseSlug: string,
): Promise<string> {
  for (let ordinal = 1; ordinal <= 99; ordinal += 1) {
    const candidate = ordinal === 1 ? baseSlug : appendSlugCollisionSuffix(baseSlug, ordinal);
    const collision = await db.query.products.findFirst({
      columns: { id: true },
      where: eq(products.slug, candidate),
    });
    if (!collision) return candidate;
  }

  throw new DuplicateEntityError("No available product slug was found.");
}

function productSnapshot(product: {
  brandId: string;
  componentTypeId: string;
  partNumber: string | null;
  title: string;
  description: string | null;
  salePrice: string | null;
  currency: string;
  status: string;
  isPublic: boolean;
}, serials?: {
  primarySerialNumber: string | null;
  secondarySerialNumbers: string[];
}) {
  return {
    brandId: product.brandId,
    componentTypeId: product.componentTypeId,
    partNumber: product.partNumber,
    title: product.title,
    description: product.description,
    salePrice: product.salePrice,
    currency: product.currency,
    status: product.status,
    isPublic: product.isPublic,
    primarySerialNumber: serials?.primarySerialNumber ?? null,
    secondarySerialNumbers: serials?.secondarySerialNumbers ?? [],
  };
}

export async function createProductInTransaction(
  tx: ProductTransaction,
  input: CreateProductMutationInput,
) {
  const catalog = await loadCatalogContext(tx, input);
  const compatibilities = normalizedCompatibilities(input.compatibilities);
  const serials = normalizedSerials(input);
  await assertCompatibilityBrandsExist(
    tx,
    compatibilities.map(({ brandId }) => brandId),
  );

  const normalizedPartNumber = input.partNumber
    ? normalizePartNumber(input.partNumber)
    : null;
  const compatibleModel = compatibilities[0]?.model ?? null;
  const baseSku = generateSku({
    brandCode: catalog.brand.code,
    componentCode: catalog.componentType.code,
    partNumber: input.partNumber,
    compatibleModel,
  });
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`product-sku:${baseSku}`}, 0))`,
  );
  const sku = await resolveAvailableSku(tx, baseSku, {
    brandId: catalog.brand.id,
    componentTypeId: catalog.componentType.id,
    normalizedPartNumber,
  });
  const generatedTitle = buildProductTitle({
    componentType: catalog.componentType.name.toUpperCase(),
    partNumber: input.partNumber,
    brand: catalog.brand.name.toUpperCase(),
    compatibleModel,
  });
  const title = input.title ?? generatedTitle;
  const baseSlug = generateProductSlug({
    componentType: catalog.componentType.name,
    partNumber: input.partNumber,
    brand: catalog.brand.name,
    compatibleModel,
    sku,
  });
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`product-slug:${baseSlug}`}, 0))`,
  );
  const slug = await resolveAvailableSlug(tx, baseSlug);
  const isPublic = isProductPublic(input);
  const [product] = await tx
    .insert(products)
    .values({
      sku,
      slug,
      brandId: catalog.brand.id,
      componentTypeId: catalog.componentType.id,
      partNumber: input.partNumber,
      normalizedPartNumber,
      title,
      description: input.description,
      salePrice: input.salePrice,
      currency: input.currency,
      status: input.status,
      isPublic,
    })
    .returning();

  if (!product) throw new Error("Product insert did not return a row.");

  if (compatibilities.length > 0) {
    await tx.insert(productCompatibilities).values(
      compatibilities.map((compatibility) => ({
        productId: product.id,
        brandId: compatibility.brandId,
        model: compatibility.model,
        normalizedModel: compatibility.normalizedModel,
        notes: compatibility.notes,
      })),
    );
  }

  await replaceProductSerialNumbers(tx, product.id, serials);

  await createAuditLog(tx, {
    action: "PRODUCT_CREATED",
    entityType: "PRODUCT",
    entityId: product.id,
    after: { sku: product.sku, ...productSnapshot(product, serials) },
  });

  return product;
}

export async function createProduct(
  db: Database,
  input: CreateProductMutationInput,
) {
  return db.transaction((tx) => createProductInTransaction(tx, input));
}

export async function updateProduct(
  db: Database,
  input: UpdateProductMutationInput,
) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.products.findFirst({
      where: and(eq(products.id, input.id), isNull(products.deletedAt)),
    });
    if (!existing) throw new EntityNotFoundError("Product not found.");

    const existingSerialRows = await tx
      .select()
      .from(productSerialNumbers)
      .where(eq(productSerialNumbers.productId, input.id))
      .orderBy(asc(productSerialNumbers.sortOrder));
    const existingSerials = {
      primarySerialNumber:
        existingSerialRows.find(({ kind }) => kind === "PRIMARY")?.serialNumber ?? null,
      secondarySerialNumbers: existingSerialRows
        .filter(({ kind }) => kind === "SECONDARY")
        .map(({ serialNumber }) => serialNumber),
    };

    const catalog = await loadCatalogContext(tx, input);
    const compatibilities = normalizedCompatibilities(input.compatibilities);
    const serials = normalizedSerials(input);
    await assertCompatibilityBrandsExist(
      tx,
      compatibilities.map(({ brandId }) => brandId),
    );

    const compatibleModel = compatibilities[0]?.model ?? null;
    const generatedTitle = buildProductTitle({
      componentType: catalog.componentType.name.toUpperCase(),
      partNumber: input.partNumber,
      brand: catalog.brand.name.toUpperCase(),
      compatibleModel,
    });
    const nextUpdatedAt = new Date();
    const [updated] = await tx
      .update(products)
      .set({
        brandId: catalog.brand.id,
        componentTypeId: catalog.componentType.id,
        partNumber: input.partNumber,
        normalizedPartNumber: input.partNumber
          ? normalizePartNumber(input.partNumber)
          : null,
        title: input.title ?? generatedTitle,
        description: input.description,
        salePrice: input.salePrice,
        currency: input.currency,
        status: input.status,
        isPublic: isProductPublic(input),
        updatedAt: nextUpdatedAt,
      })
      .where(
        and(
          eq(products.id, input.id),
          eq(products.updatedAt, input.expectedUpdatedAt),
          isNull(products.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConcurrentModificationError("Product was modified by another operation.");
    }

    await tx
      .delete(productCompatibilities)
      .where(eq(productCompatibilities.productId, input.id));
    if (compatibilities.length > 0) {
      await tx.insert(productCompatibilities).values(
        compatibilities.map((compatibility) => ({
          productId: input.id,
          brandId: compatibility.brandId,
          model: compatibility.model,
          normalizedModel: compatibility.normalizedModel,
          notes: compatibility.notes,
        })),
      );
    }

    await replaceProductSerialNumbers(tx, input.id, serials);

    await createAuditLog(tx, {
      action: "PRODUCT_UPDATED",
      entityType: "PRODUCT",
      entityId: input.id,
      before: productSnapshot(existing, existingSerials),
      after: productSnapshot(updated, serials),
      metadata: { skuPreserved: existing.sku === updated.sku },
    });

    return updated;
  });
}

export async function archiveProduct(
  db: Database,
  input: { id: string; expectedUpdatedAt: Date },
) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.products.findFirst({
      where: and(eq(products.id, input.id), isNull(products.deletedAt)),
    });
    if (!existing) throw new EntityNotFoundError("Product not found.");

    const [archived] = await tx
      .update(products)
      .set({ status: "ARCHIVED", isPublic: false, updatedAt: new Date() })
      .where(
        and(eq(products.id, input.id), eq(products.updatedAt, input.expectedUpdatedAt)),
      )
      .returning();
    if (!archived) {
      throw new ConcurrentModificationError("Product was modified by another operation.");
    }

    await createAuditLog(tx, {
      action: "PRODUCT_ARCHIVED",
      entityType: "PRODUCT",
      entityId: input.id,
      before: { status: existing.status, isPublic: existing.isPublic },
      after: { status: archived.status, isPublic: archived.isPublic },
    });

    return archived;
  });
}
