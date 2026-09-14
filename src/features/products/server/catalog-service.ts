import "server-only";

import { and, eq, or, sql } from "drizzle-orm";

import type { Database } from "@/db/connection";
import {
  brandAliases,
  brands,
  componentTypeAliases,
  componentTypes,
} from "@/db/schema";
import { buildCatalogIdentity } from "@/features/products/domain/catalog-identity";
import {
  normalizeBrand,
  normalizeComponentType,
} from "@/features/products/domain/product-normalization";
import { normalizeWhitespace } from "@/features/shared/domain/text-normalization";
import { DuplicateEntityError } from "@/features/shared/domain/service-errors";

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
    if (created) return created;
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
    if (created) return created;
  }

  throw new DuplicateEntityError("No available component catalog identity was found.");
}
