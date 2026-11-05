import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const source = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
const safe = source && ["127.0.0.1", "localhost"].includes(source.hostname) && source.pathname === "/jumbobox_test";
describe.skipIf(!safe)("sales migrations preserve existing PostgreSQL data", () => {
  it("upgrades legacy products, archival, stock, movements and identities unchanged; validates constraints/indexes/triggers; reruns as a no-op", async () => {
    if (!safe || !source) throw new Error("Disposable PostgreSQL only");
    const name = `jumbobox_sales_${randomUUID().replaceAll("-", "")}`; const target = new URL(source.href); target.pathname = `/${name}`;
    const admin = new Pool({ connectionString: source.href }); const pool = new Pool({ connectionString: target.href }); const folder = mkdtempSync(join(tmpdir(), "jumbobox-sales-"));
    const legacyTables = ["products", "inventory_items", "inventory_movements", "locations", "brands", "component_types", "user", "session", "account", "audit_logs"];
    async function snapshot() {
      const tables: Record<string, unknown> = {};
      for (const t of legacyTables) tables[t] = (await pool.query(`select count(*)::int as count, md5(coalesce(string_agg(to_jsonb(t)::text, '' order by id), '')) as fingerprint from "${t}" t`)).rows[0];
      return { tables, totals: (await pool.query("select product_id,status,sum(quantity)::int as quantity from inventory_items group by product_id,status order by product_id,status")).rows, sequence: (await pool.query("select * from inventory_code_seq")).rows };
    }
    try {
      await admin.query(`create database "${name}"`);
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")); const entries = journal.entries.filter((e: { idx: number }) => e.idx < 9);
      mkdirSync(join(folder, "meta")); writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
      for (const e of entries) copyFileSync(`drizzle/${e.tag}.sql`, join(folder, `${e.tag}.sql`));
      await migrate(drizzle(pool), { migrationsFolder: folder });
      const brand = (await pool.query("insert into brands(name,normalized_name,code,slug) values ('Legacy','LEGACY','LG','legacy') returning id")).rows[0];
      const type = (await pool.query("insert into component_types(name,normalized_name,code,slug) values ('Legacy Board','LEGACY BOARD','MB','legacy-board') returning id")).rows[0];
      const location = (await pool.query("insert into locations(code,name,type) values ('OLD','Histórica','BOX') returning id")).rows[0];
      const user = (await pool.query('insert into "user"(name,email) values (\'Legacy Admin\',\'legacy@example.test\') returning id')).rows[0];
      for (const [i, status] of ["ACTIVE", "ARCHIVED", "DRAFT"].entries()) {
        const p = (await pool.query("insert into products(sku,slug,brand_id,component_type_id,title,sale_price,status,warranty,is_public) values ($1,$2,$3,$4,'Historical product',123.45,$5,'30 días',false) returning id", [`LG-MB-OLD${i}`, `old${i}`, brand.id, type.id, status])).rows[0];
        const s = (await pool.query("insert into inventory_items(product_id,location_id,quantity,legacy_bag_number,purchase_cost) values ($1,$2,7,'Bolsa histórica',45.67) returning id", [p.id, location.id])).rows[0];
        await pool.query("insert into inventory_movements(inventory_item_id,type,quantity,to_location_id,user_id,reason,metadata) values ($1,'INITIAL',7,$2,$3,'Histórico', '{\"legacy\":true}')", [s.id, location.id, user.id]);
      }
      const before = await snapshot(); const historyBefore = (await pool.query("select hash,created_at from drizzle.__drizzle_migrations order by id")).rows;
      const denied = spawnSync(process.execPath, ["--import", "tsx", "src/scripts/sales-release.ts", "migrate-production"], { encoding: "utf8", env: { ...process.env, SALES_DATABASE_URL: target.href, SALES_RELEASE_EVIDENCE: "", SALES_PRODUCTION_APPROVAL: "" } });
      expect(denied.status).toBe(1); expect((await pool.query("select * from drizzle.__drizzle_migrations")).rows).toHaveLength(9); expect(await snapshot()).toEqual(before);
      const applied = spawnSync(process.execPath, ["--import", "tsx", "src/scripts/sales-release.ts", "migrate-test"], { encoding: "utf8", env: { ...process.env, SALES_DATABASE_URL: target.href } });
      expect(applied.status, applied.stdout + applied.stderr).toBe(0); expect(applied.stdout).toContain('"secondRunNoOp":true'); expect(await snapshot()).toEqual(before);
      const history = (await pool.query("select hash,created_at from drizzle.__drizzle_migrations order by id")).rows;
      expect(history.slice(0, 9)).toEqual(historyBefore); expect(history).toHaveLength(11);
      const tables = (await pool.query("select tablename from pg_tables where schemaname='public' and (tablename='sales' or tablename like 'sale_%')")).rows; expect(tables).toHaveLength(7);
      const constraints = (await pool.query("select conname from pg_constraint where conrelid='sales'::regclass")).rows; expect(constraints.map(c => c.conname)).toContain("sales_money_valid");
      const indexes = (await pool.query("select indexname from pg_indexes where tablename='sales'")).rows; expect(indexes.map(i => i.indexname)).toContain("sales_status_created_idx");
      const triggers = (await pool.query("select tgname from pg_trigger where not tgisinternal and tgrelid='sales'::regclass")).rows; expect(triggers.map(t => t.tgname)).toContain("sales_snapshot_guard");
      const unvalidated = (await pool.query("select conname from pg_constraint where not convalidated and connamespace='public'::regnamespace")).rows; expect(unvalidated).toHaveLength(0);
      await migrate(drizzle(pool), { migrationsFolder: "drizzle" }); expect((await pool.query("select hash,created_at from drizzle.__drizzle_migrations order by id")).rows).toEqual(history); expect(await snapshot()).toEqual(before);
    } finally {
      await pool.end(); await admin.query(`drop database if exists "${name}"`); await admin.end();
      const inside = relative(tmpdir(), folder); if (!inside.startsWith("jumbobox-sales-") || inside.includes("..")) throw new Error("Unexpected fixture path"); rmSync(folder, { recursive: true, force: true });
    }
  }, 60000);
});
