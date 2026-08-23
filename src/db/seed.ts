import { config } from "dotenv";
import { inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

import {
  assertSeedDataIsInternallyUnique,
  brandAliasSeedRecords,
  brandSeedRecords,
  componentTypeAliasSeedRecords,
  componentTypeSeedRecords,
} from "@/db/seed-data";
import * as schema from "@/db/schema";
import {
  brandAliases,
  brands,
  componentTypeAliases,
  componentTypes,
} from "@/db/schema";
import { parseDatabaseEnv } from "@/lib/env-schema";

export async function seedDatabase(db: NodePgDatabase<typeof schema>): Promise<void> {
  assertSeedDataIsInternallyUnique();

  await db.transaction(async (tx) => {
    await tx.insert(brands).values(brandSeedRecords).onConflictDoNothing();
    await tx.insert(componentTypes).values(componentTypeSeedRecords).onConflictDoNothing();

    const brandRows = await tx
      .select({ id: brands.id, normalizedName: brands.normalizedName })
      .from(brands)
      .where(
        inArray(
          brands.normalizedName,
          brandAliasSeedRecords.map(({ targetNormalizedName }) => targetNormalizedName),
        ),
      );
    const brandIdByName = new Map(
      brandRows.map(({ id, normalizedName }) => [normalizedName, id]),
    );

    for (const alias of brandAliasSeedRecords) {
      const brandId = brandIdByName.get(alias.targetNormalizedName);
      if (!brandId) {
        throw new Error(`Brand alias target was not seeded: ${alias.targetNormalizedName}`);
      }

      await tx
        .insert(brandAliases)
        .values({
          brandId,
          alias: alias.alias,
          normalizedAlias: alias.normalizedAlias,
        })
        .onConflictDoUpdate({
          target: brandAliases.normalizedAlias,
          set: { brandId, alias: alias.alias, active: true, updatedAt: new Date() },
        });
    }

    const componentTypeRows = await tx
      .select({ id: componentTypes.id, normalizedName: componentTypes.normalizedName })
      .from(componentTypes)
      .where(
        inArray(
          componentTypes.normalizedName,
          componentTypeAliasSeedRecords.map(
            ({ targetNormalizedName }) => targetNormalizedName,
          ),
        ),
      );
    const componentTypeIdByName = new Map(
      componentTypeRows.map(({ id, normalizedName }) => [normalizedName, id]),
    );

    for (const alias of componentTypeAliasSeedRecords) {
      const componentTypeId = componentTypeIdByName.get(alias.targetNormalizedName);
      if (!componentTypeId) {
        throw new Error(
          `Component type alias target was not seeded: ${alias.targetNormalizedName}`,
        );
      }

      await tx
        .insert(componentTypeAliases)
        .values({
          componentTypeId,
          alias: alias.alias,
          normalizedAlias: alias.normalizedAlias,
        })
        .onConflictDoUpdate({
          target: componentTypeAliases.normalizedAlias,
          set: {
            componentTypeId,
            alias: alias.alias,
            active: true,
            updatedAt: new Date(),
          },
        });
    }
  });
}

async function main(): Promise<void> {
  config({ path: ".env.local" });
  config({ path: ".env" });

  const { DATABASE_URL } = parseDatabaseEnv(process.env);
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await seedDatabase(drizzle(pool, { schema }));
    console.info("JombuBox seed completed successfully.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
