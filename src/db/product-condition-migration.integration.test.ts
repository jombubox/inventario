import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import type { Database } from "@/db/connection";
import * as schema from "@/db/schema";
import { quickAddInventory } from "@/features/inventory/server/quick-add-service";
import { quickAddInventoryMutationSchema } from "@/validators/quick-add-inventory";

const source = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
const local = source && ["localhost", "127.0.0.1"].includes(source.hostname) && source.pathname === "/jumbobox_test";

describe.skipIf(!local)("additive product condition migration", () => {
  it("preserves pre-migration product/stock data and is a no-op on its second run", async () => {
    if (!source || !local) throw new Error("Requires disposable local PostgreSQL");
    const databaseName = `jumbobox_migration_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: source.href });
    const target = new URL(source.href); target.pathname = `/${databaseName}`;
    const pool = new Pool({ connectionString: target.href });
    const folder = mkdtempSync(join(tmpdir(), "jumbobox-migration-"));
    try {
      await admin.query(`create database "${databaseName}"`);
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
      const oldEntries = journal.entries.filter((entry: { idx: number }) => entry.idx < 7);
      mkdirSync(join(folder, "meta"));
      writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: oldEntries }));
      for (const entry of oldEntries) copyFileSync(`drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
      await migrate(drizzle(pool), { migrationsFolder: folder });
      const brand = (await pool.query("insert into brands(name,normalized_name,code,slug) values ('Legacy','LEGACY','LG','legacy') returning id")).rows[0];
      const type = (await pool.query("insert into component_types(name,normalized_name,code,slug) values ('Board','BOARD','MB','board') returning id")).rows[0];
      const product = (await pool.query("insert into products(sku,slug,brand_id,component_type_id,title,sale_price,status,is_public) values ('LG-MB-OLD','legacy-board',$1,$2,'Legacy board',123.45,'ACTIVE',true) returning *", [brand.id, type.id])).rows[0];
      const stock = (await pool.query("insert into inventory_items(product_id,quantity,condition,legacy_bag_number) values ($1,7,'USED_GOOD','7') returning *", [product.id])).rows[0];
      const parent = (await pool.query("insert into locations(code,name,type,active) values ('LEGACY-WH','Almacén legacy','WAREHOUSE',true) returning id")).rows[0];
      const box = (await pool.query("insert into locations(code,name,type,parent_id,active) values ('LEGACY-BOX','Caja legacy','BOX',$1,true) returning id", [parent.id])).rows[0];
      const db = drizzle(pool, { schema }) as unknown as Database;
      const placement = { locationId: parent.id, boxMode: "existing", boxId: box.id, quantity: 3 };
      const existingInput = quickAddInventoryMutationSchema.parse({ ...placement, productMode: "existing", productId: product.id });
      const newInput = quickAddInventoryMutationSchema.parse({ ...placement, productMode: "new", brandId: brand.id, componentTypeId: type.id, partNumber: "QUICK-LEGACY-NEW", compatibilities: [] });
      // Existing: SELECT products.condition. New: INSERT products.condition.
      // Reproduce independently on the pre-0007 schema, never on production.
      await expect(quickAddInventory(db, existingInput)).rejects.toMatchObject({ cause: { code: "42703" } });
      await expect(quickAddInventory(db, newInput)).rejects.toMatchObject({ cause: { code: "42703" } });
      expect((await pool.query("select count(*)::int as count from products")).rows[0].count).toBe(1);
      expect((await pool.query("select count(*)::int as count from inventory_items")).rows[0].count).toBe(1);
      await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
      expect((await pool.query("select * from products where id=$1", [product.id])).rows[0]).toEqual({ ...product, condition: null });
      expect((await pool.query("select * from inventory_items where id=$1", [stock.id])).rows[0]).toEqual(stock);
      await expect(pool.query("update products set condition='invalid' where id=$1", [product.id])).rejects.toMatchObject({ code: "23514" });
      await pool.query("update products set condition='USED' where id=$1", [product.id]);
      const migrationRows = (await pool.query('select * from drizzle.__drizzle_migrations order by id')).rows;
      const persisted = (await pool.query("select * from products where id=$1", [product.id])).rows;
      await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
      expect((await pool.query('select * from drizzle.__drizzle_migrations order by id')).rows).toEqual(migrationRows);
      expect((await pool.query("select * from products where id=$1", [product.id])).rows).toEqual(persisted);
      const existingAdded = await quickAddInventory(db, existingInput);
      const newAdded = await quickAddInventory(db, newInput);
      expect(existingAdded).toMatchObject({ productCreated: false, item: { quantity: 3 }, product: { condition: "USED" } });
      expect(newAdded).toMatchObject({ productCreated: true, item: { quantity: 3 }, product: { condition: "NEW", currency: "MXN", status: "ACTIVE", isPublic: true } });
    } finally {
      await pool.end();
      await admin.query(`drop database if exists "${databaseName}"`);
      await admin.end();
      const insideTemp = relative(tmpdir(), folder);
      if (!insideTemp.startsWith("jumbobox-migration-") || insideTemp.includes("..")) throw new Error("Unexpected fixture path");
      rmSync(folder, { recursive: true, force: true });
    }
  }, 60_000);
});
