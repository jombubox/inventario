import "server-only";

import { and, count, eq, or, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  brandAliases,
  brands,
  componentTypeAliases,
  componentTypes,
} from "@/db/schema";
import { products, productCompatibilities } from "@/db/schema";
import { createAuditLog } from "@/features/audit/data/audit-log";
import { buildCatalogIdentity } from "@/features/products/domain/catalog-identity";
import {
  normalizeBrand,
  normalizeComponentType,
} from "@/features/products/domain/product-normalization";
import { normalizeWhitespace } from "@/features/shared/domain/text-normalization";
import {
  ConcurrentModificationError,
  DuplicateEntityError,
  EntityNotFoundError,
  InvalidOperationError,
} from "@/features/shared/domain/service-errors";
import type {
  ArchiveCatalogEntryMutationInput,
  CreateCatalogEntryMutationInput,
  UpdateCatalogEntryMutationInput,
} from "@/validators/admin-catalog";

type CatalogTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type CatalogEntry = { id: string; name: string; code: string };

async function activateBrand(
  tx: CatalogTransaction,
  entry: CatalogEntry & { active: boolean },
): Promise<CatalogEntry> {
  if (entry.active) return entry;
  const [updated] = await tx
    .update(brands)
    .set({ active: true, updatedAt: new Date() })
    .where(eq(brands.id, entry.id))
    .returning({ id: brands.id, name: brands.name, code: brands.code });
  if (!updated) throw new Error("Brand activation did not return a row.");
  await createAuditLog(tx, {
    action: "BRAND_UPDATED",
    entityType: "BRAND",
    entityId: entry.id,
    before: { name: entry.name, active: false },
    after: { name: updated.name, active: true },
    metadata: { reason: "reactivated_during_resolution" },
  });
  return updated;
}

async function activateComponentType(
  tx: CatalogTransaction,
  entry: CatalogEntry & { active: boolean },
): Promise<CatalogEntry> {
  if (entry.active) return entry;
  const [updated] = await tx
    .update(componentTypes)
    .set({ active: true, updatedAt: new Date() })
    .where(eq(componentTypes.id, entry.id))
    .returning({
      id: componentTypes.id,
      name: componentTypes.name,
      code: componentTypes.code,
    });
  if (!updated) throw new Error("Component type activation did not return a row.");
  await createAuditLog(tx, {
    action: "COMPONENT_TYPE_UPDATED",
    entityType: "COMPONENT_TYPE",
    entityId: entry.id,
    before: { name: entry.name, active: false },
    after: { name: updated.name, active: true },
    metadata: { reason: "reactivated_during_resolution" },
  });
  return updated;
}

export async function resolveOrCreateBrand(
  tx: CatalogTransaction,
  rawName: string,
): Promise<CatalogEntry> {
  const name = normalizeWhitespace(rawName);
  const normalizedName = normalizeBrand(name);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`catalog-brand:${normalizedName}`}, 0))`,
  );

  const direct = await tx.query.brands.findFirst({
    columns: { id: true, name: true, code: true, active: true },
    where: eq(brands.normalizedName, normalizedName),
  });
  if (direct) return activateBrand(tx, direct);

  const [aliasMatch] = await tx
    .select({
      id: brands.id,
      name: brands.name,
      code: brands.code,
      active: brands.active,
    })
    .from(brandAliases)
    .innerJoin(brands, eq(brandAliases.brandId, brands.id))
    .where(
      and(
        eq(brandAliases.normalizedAlias, normalizedName),
        eq(brandAliases.active, true),
      ),
    )
    .limit(1);
  if (aliasMatch) return activateBrand(tx, aliasMatch);

  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('catalog-brand:create', 0))`);
  for (let ordinal = 1; ordinal <= 99; ordinal += 1) {
    const identity = buildCatalogIdentity(name, "brand", ordinal);
    const collision = await tx.query.brands.findFirst({
      columns: { id: true },
      where: or(eq(brands.code, identity.code), eq(brands.slug, identity.slug)),
    });
    if (collision) continue;

    const [created] = await tx
      .insert(brands)
      .values({ name, normalizedName, ...identity, active: true })
      .returning({ id: brands.id, name: brands.name, code: brands.code });
    if (created) {
      await createAuditLog(tx, {
        action: "BRAND_CREATED",
        entityType: "BRAND",
        entityId: created.id,
        after: created,
      });
      return created;
    }
  }

  throw new DuplicateEntityError("No available brand catalog identity was found.");
}

export async function resolveOrCreateComponentType(
  tx: CatalogTransaction,
  rawName: string,
): Promise<CatalogEntry> {
  const name = normalizeWhitespace(rawName);
  const normalizedName = normalizeComponentType(name);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`catalog-component:${normalizedName}`}, 0))`,
  );

  const direct = await tx.query.componentTypes.findFirst({
    columns: { id: true, name: true, code: true, active: true },
    where: eq(componentTypes.normalizedName, normalizedName),
  });
  if (direct) return activateComponentType(tx, direct);

  const [aliasMatch] = await tx
    .select({
      id: componentTypes.id,
      name: componentTypes.name,
      code: componentTypes.code,
      active: componentTypes.active,
    })
    .from(componentTypeAliases)
    .innerJoin(
      componentTypes,
      eq(componentTypeAliases.componentTypeId, componentTypes.id),
    )
    .where(
      and(
        eq(componentTypeAliases.normalizedAlias, normalizedName),
        eq(componentTypeAliases.active, true),
      ),
    )
    .limit(1);
  if (aliasMatch) return activateComponentType(tx, aliasMatch);

  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('catalog-component:create', 0))`,
  );
  for (let ordinal = 1; ordinal <= 99; ordinal += 1) {
    const identity = buildCatalogIdentity(name, "componentType", ordinal);
    const collision = await tx.query.componentTypes.findFirst({
      columns: { id: true },
      where: or(
        eq(componentTypes.code, identity.code),
        eq(componentTypes.slug, identity.slug),
      ),
    });
    if (collision) continue;

    const [created] = await tx
      .insert(componentTypes)
      .values({ name, normalizedName, ...identity, active: true })
      .returning({
        id: componentTypes.id,
        name: componentTypes.name,
        code: componentTypes.code,
      });
    if (created) {
      await createAuditLog(tx, {
        action: "COMPONENT_TYPE_CREATED",
        entityType: "COMPONENT_TYPE",
        entityId: created.id,
        after: created,
      });
      return created;
    }
  }

  throw new DuplicateEntityError("No available component catalog identity was found.");
}

async function findBrandByNormalizedName(tx: CatalogTransaction, normalizedName: string) {
  const direct = await tx.query.brands.findFirst({
    columns: { id: true, name: true, code: true, active: true },
    where: eq(brands.normalizedName, normalizedName),
  });
  if (direct) return direct;
  const [alias] = await tx
    .select({ id: brands.id, name: brands.name, code: brands.code, active: brands.active })
    .from(brandAliases)
    .innerJoin(brands, eq(brandAliases.brandId, brands.id))
    .where(and(eq(brandAliases.normalizedAlias, normalizedName), eq(brandAliases.active, true)))
    .limit(1);
  return alias;
}

async function findComponentTypeByNormalizedName(
  tx: CatalogTransaction,
  normalizedName: string,
) {
  const direct = await tx.query.componentTypes.findFirst({
    columns: { id: true, name: true, code: true, active: true },
    where: eq(componentTypes.normalizedName, normalizedName),
  });
  if (direct) return direct;
  const [alias] = await tx
    .select({
      id: componentTypes.id,
      name: componentTypes.name,
      code: componentTypes.code,
      active: componentTypes.active,
    })
    .from(componentTypeAliases)
    .innerJoin(componentTypes, eq(componentTypeAliases.componentTypeId, componentTypes.id))
    .where(
      and(
        eq(componentTypeAliases.normalizedAlias, normalizedName),
        eq(componentTypeAliases.active, true),
      ),
    )
    .limit(1);
  return alias;
}

export async function createBrandCatalogEntry(
  db: Database,
  input: CreateCatalogEntryMutationInput,
) {
  return db.transaction(async (tx) => {
    const name = normalizeWhitespace(input.name);
    const normalizedName = normalizeBrand(name);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`catalog-brand:${normalizedName}`}, 0))`,
    );
    const existing = await findBrandByNormalizedName(tx, normalizedName);
    if (existing) {
      return { entry: await activateBrand(tx, existing), created: false as const };
    }
    return { entry: await resolveOrCreateBrand(tx, name), created: true as const };
  });
}

export async function createComponentTypeCatalogEntry(
  db: Database,
  input: CreateCatalogEntryMutationInput,
) {
  return db.transaction(async (tx) => {
    const name = normalizeWhitespace(input.name);
    const normalizedName = normalizeComponentType(name);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`catalog-component:${normalizedName}`}, 0))`,
    );
    const existing = await findComponentTypeByNormalizedName(tx, normalizedName);
    if (existing) {
      return { entry: await activateComponentType(tx, existing), created: false as const };
    }
    return { entry: await resolveOrCreateComponentType(tx, name), created: true as const };
  });
}

export async function updateBrandCatalogEntry(
  db: Database,
  input: UpdateCatalogEntryMutationInput,
) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.brands.findFirst({ where: eq(brands.id, input.id) });
    if (!existing) throw new EntityNotFoundError("La marca ya no existe.");
    const name = normalizeWhitespace(input.name);
    const normalizedName = normalizeBrand(name);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`catalog-brand:${normalizedName}`}, 0))`,
    );
    const collision = await findBrandByNormalizedName(tx, normalizedName);
    if (collision && collision.id !== input.id) {
      throw new DuplicateEntityError("Esta marca ya existe.");
    }
    const [updated] = await tx
      .update(brands)
      .set({ name, normalizedName, updatedAt: new Date() })
      .where(and(eq(brands.id, input.id), eq(brands.updatedAt, input.expectedUpdatedAt)))
      .returning();
    if (!updated) throw new ConcurrentModificationError("La marca fue modificada.");
    if (existing.normalizedName !== normalizedName) {
      await tx
        .insert(brandAliases)
        .values({
          brandId: input.id,
          alias: existing.name,
          normalizedAlias: existing.normalizedName,
          active: true,
        })
        .onConflictDoNothing({ target: brandAliases.normalizedAlias });
    }
    await createAuditLog(tx, {
      action: "BRAND_UPDATED",
      entityType: "BRAND",
      entityId: input.id,
      before: { name: existing.name, active: existing.active },
      after: { name: updated.name, active: updated.active },
    });
    return updated;
  });
}

export async function updateComponentTypeCatalogEntry(
  db: Database,
  input: UpdateCatalogEntryMutationInput,
) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.componentTypes.findFirst({
      where: eq(componentTypes.id, input.id),
    });
    if (!existing) throw new EntityNotFoundError("El tipo de pieza ya no existe.");
    const name = normalizeWhitespace(input.name);
    const normalizedName = normalizeComponentType(name);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`catalog-component:${normalizedName}`}, 0))`,
    );
    const collision = await findComponentTypeByNormalizedName(tx, normalizedName);
    if (collision && collision.id !== input.id) {
      throw new DuplicateEntityError("Este tipo de pieza ya existe.");
    }
    const [updated] = await tx
      .update(componentTypes)
      .set({ name, normalizedName, updatedAt: new Date() })
      .where(
        and(
          eq(componentTypes.id, input.id),
          eq(componentTypes.updatedAt, input.expectedUpdatedAt),
        ),
      )
      .returning();
    if (!updated) throw new ConcurrentModificationError("El tipo de pieza fue modificado.");
    if (existing.normalizedName !== normalizedName) {
      await tx
        .insert(componentTypeAliases)
        .values({
          componentTypeId: input.id,
          alias: existing.name,
          normalizedAlias: existing.normalizedName,
          active: true,
        })
        .onConflictDoNothing({ target: componentTypeAliases.normalizedAlias });
    }
    await createAuditLog(tx, {
      action: "COMPONENT_TYPE_UPDATED",
      entityType: "COMPONENT_TYPE",
      entityId: input.id,
      before: { name: existing.name, active: existing.active },
      after: { name: updated.name, active: updated.active },
    });
    return updated;
  });
}

export async function archiveBrandCatalogEntry(
  db: Database,
  input: ArchiveCatalogEntryMutationInput,
) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.brands.findFirst({ where: eq(brands.id, input.id) });
    if (!existing) throw new EntityNotFoundError("La marca ya no existe.");
    const [primaryUsage, compatibilityUsage] = await Promise.all([
      tx.select({ value: count() }).from(products).where(eq(products.brandId, input.id)),
      tx
        .select({ value: count() })
        .from(productCompatibilities)
        .where(eq(productCompatibilities.brandId, input.id)),
    ]);
    const usage = (primaryUsage[0]?.value ?? 0) + (compatibilityUsage[0]?.value ?? 0);
    if (usage > 0) {
      throw new InvalidOperationError(
        `No puedes desactivar esta marca porque está siendo utilizada en ${usage} producto(s).`,
      );
    }
    const [archived] = await tx
      .update(brands)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(brands.id, input.id), eq(brands.updatedAt, input.expectedUpdatedAt)))
      .returning();
    if (!archived) throw new ConcurrentModificationError("La marca fue modificada.");
    await createAuditLog(tx, {
      action: "BRAND_ARCHIVED",
      entityType: "BRAND",
      entityId: input.id,
      before: { name: existing.name, active: existing.active },
      after: { name: archived.name, active: false },
    });
    return archived;
  });
}

export async function archiveComponentTypeCatalogEntry(
  db: Database,
  input: ArchiveCatalogEntryMutationInput,
) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.componentTypes.findFirst({
      where: eq(componentTypes.id, input.id),
    });
    if (!existing) throw new EntityNotFoundError("El tipo de pieza ya no existe.");
    const usageRows = await tx
      .select({ value: count() })
      .from(products)
      .where(eq(products.componentTypeId, input.id));
    const usage = usageRows[0]?.value ?? 0;
    if (usage > 0) {
      throw new InvalidOperationError(
        `No puedes desactivar este tipo de pieza porque está siendo utilizado por ${usage} producto(s).`,
      );
    }
    const [archived] = await tx
      .update(componentTypes)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(componentTypes.id, input.id),
          eq(componentTypes.updatedAt, input.expectedUpdatedAt),
        ),
      )
      .returning();
    if (!archived) throw new ConcurrentModificationError("El tipo de pieza fue modificado.");
    await createAuditLog(tx, {
      action: "COMPONENT_TYPE_ARCHIVED",
      entityType: "COMPONENT_TYPE",
      entityId: input.id,
      before: { name: existing.name, active: existing.active },
      after: { name: archived.name, active: false },
    });
    return archived;
  });
}
