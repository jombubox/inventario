import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  brands,
  componentTypes,
  productCompatibilities,
  products,
} from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
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
  appendSlugCollisionSuffix,
  generateProductSlug,
} from "@/features/products/domain/product-slug";
import {
  ConcurrentModificationError,
  DuplicateEntityError,
  EntityNotFoundError,
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
  brandId: string,
  componentTypeId: string,
): Promise<CatalogContext> {
  const [brand, componentType] = await Promise.all([
    db.query.brands.findFirst({
      columns: { id: true, name: true, code: true },
      where: and(eq(brands.id, brandId), eq(brands.active, true)),
    }),
    db.query.componentTypes.findFirst({
      columns: { id: true, name: true, code: true },
      where: and(eq(componentTypes.id, componentTypeId), eq(componentTypes.active, true)),
    }),
  ]);

  if (!brand) {
    throw new EntityNotFoundError("Brand not found or inactive.");
  }
  if (!componentType) {
    throw new EntityNotFoundError("Component type not found or inactive.");
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
  };
}

export async function createProductInTransaction(
  tx: ProductTransaction,
  input: CreateProductMutationInput,
) {
  const catalog = await loadCatalogContext(tx, input.brandId, input.componentTypeId);
    const compatibilities = normalizedCompatibilities(input.compatibilities);
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
      brandId: input.brandId,
      componentTypeId: input.componentTypeId,
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
    const isPublic = input.status === "ACTIVE" && input.isPublic;
    const [product] = await tx
      .insert(products)
      .values({
        sku,
        slug,
        brandId: input.brandId,
        componentTypeId: input.componentTypeId,
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

    await createAuditLog(tx, {
      action: "PRODUCT_CREATED",
      entityType: "PRODUCT",
      entityId: product.id,
      after: { sku: product.sku, ...productSnapshot(product) },
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

    const catalog = await loadCatalogContext(tx, input.brandId, input.componentTypeId);
    const compatibilities = normalizedCompatibilities(input.compatibilities);
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
        brandId: input.brandId,
        componentTypeId: input.componentTypeId,
        partNumber: input.partNumber,
        normalizedPartNumber: input.partNumber
          ? normalizePartNumber(input.partNumber)
          : null,
        title: input.title ?? generatedTitle,
        description: input.description,
        salePrice: input.salePrice,
        currency: input.currency,
        status: input.status,
        isPublic: input.status === "ACTIVE" && input.isPublic,
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

    await createAuditLog(tx, {
      action: "PRODUCT_UPDATED",
      entityType: "PRODUCT",
      entityId: input.id,
      before: productSnapshot(existing),
      after: productSnapshot(updated),
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
