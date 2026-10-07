import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const source = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
const local = source && ["localhost", "127.0.0.1"].includes(source.hostname) && source.pathname === "/jumbobox_test";

describe.skipIf(!local)("additive product warranty migration", () => {
  it("preserves old products and stock, constrains warranty length and applies only once", async () => {
    if (!source || !local) throw new Error("Disposable PostgreSQL only");
    const name = `jumbobox_warranty_${randomUUID().replaceAll("-", "")}`;
    const target = new URL(source.href); target.pathname = `/${name}`;
    const admin = new Pool({ connectionString: source.href });
    const pool = new Pool({ connectionString: target.href });
    const folder = mkdtempSync(join(tmpdir(), "jumbobox-warranty-"));
    try {
      await admin.query(`create database "${name}"`);
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
      const entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 8);
      mkdirSync(join(folder, "meta"));
      writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
      for (const entry of entries) copyFileSync(`drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
      await migrate(drizzle(pool), { migrationsFolder: folder });
      const brand = (await pool.query("insert into brands(name,normalized_name,code,slug) values ('Legacy','LEGACY','LG','legacy') returning id")).rows[0];
      const type = (await pool.query("insert into component_types(name,normalized_name,code,slug) values ('Board','BOARD','MB','board') returning id")).rows[0];
      const product = (await pool.query("insert into products(sku,slug,brand_id,component_type_id,title,sale_price,condition,status,is_public) values ('LG-MB-OLD','old-board',$1,$2,'Legacy board',123.45,'USED','ACTIVE',true) returning *", [brand.id, type.id])).rows[0];
      const stock = (await pool.query("insert into inventory_items(product_id,quantity,legacy_bag_number) values ($1,7,'Bolsa 7') returning *", [product.id])).rows[0];
      await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
      expect((await pool.query("select * from products where id=$1", [product.id])).rows[0]).toEqual({ ...product, warranty: null });
      expect((await pool.query("select * from inventory_items where id=$1", [stock.id])).rows[0]).toEqual(stock);
      await pool.query("update products set warranty=$1 where id=$2", ["30 días", product.id]);
      await expect(pool.query("update products set warranty=$1 where id=$2", ["a".repeat(241), product.id])).rejects.toMatchObject({ code: "23514" });
      const migrations = (await pool.query("select * from drizzle.__drizzle_migrations order by id")).rows;
      await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
      expect((await pool.query("select * from drizzle.__drizzle_migrations order by id")).rows).toEqual(migrations);
      expect((await pool.query("select warranty from products where id=$1", [product.id])).rows[0].warranty).toBe("30 días");
    } finally {
      await pool.end(); await admin.query(`drop database if exists "${name}"`); await admin.end();
      const inside = relative(tmpdir(), folder);
      if (!inside.startsWith("jumbobox-warranty-") || inside.includes("..")) throw new Error("Unexpected fixture path");
      rmSync(folder, { recursive: true, force: true });
    }
  }, 60_000);
});
