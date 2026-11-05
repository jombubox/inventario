/** Explicit, bounded release tooling. No .env files are loaded and inspect is read-only. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const approvedTags = ["0009_sales_management", "0010_sales_history_guards"];
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function releaseMigrations() {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { idx: number; tag: string; when: number }[] };
  const all = journal.entries.map(e => ({ ...e, hash: sha256(readFileSync(`drizzle/${e.tag}.sql`)) }));
  const pending = all.filter(e => e.idx >= 9);
  if (JSON.stringify(pending.map(e => e.tag)) !== JSON.stringify(approvedTags)) throw new Error("Migration scope changed; review and regenerate release evidence.");
  return { all, pending, manifestHash: sha256(JSON.stringify(pending)) };
}
export async function databaseState(client: Client) {
  await client.query("begin isolation level repeatable read read only");
  try {
    const identity = (await client.query("select current_database() as database, current_user as role, current_setting('server_version') as version")).rows[0];
    const journal = (await client.query("select hash,created_at::text from drizzle.__drizzle_migrations order by id")).rows as { hash: string; created_at: string }[];
    const names = (await client.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name")).rows as { table_name: string }[];
    const tables: { table: string; count: number; fingerprint: string }[] = [];
    for (const { table_name: t } of names) {
      if (t === "sales" || t.startsWith("sale_")) continue;
      const quote = '"' + t.replaceAll('"', '""') + '"';
      const [row] = (await client.query(`select count(*)::int as count, md5(coalesce(string_agg(h,'' order by h),'')) as fingerprint from (select md5(to_jsonb(t)::text) h from ${quote} t) s`)).rows;
      tables.push({ table: t, ...row });
    }
    const inventory = (await client.query("select product_id,status,sum(quantity)::bigint::text as quantity from inventory_items group by product_id,status order by product_id,status")).rows;
    const columns = (await client.query("select table_name,column_name,data_type,udt_name,is_nullable,column_default,character_maximum_length,numeric_precision,numeric_scale from information_schema.columns where table_schema='public' and table_name <> 'sales' and table_name not like 'sale\\_%' order by table_name,ordinal_position")).rows;
    const constraints = (await client.query("select c.relname as table_name,p.conname,pg_get_constraintdef(p.oid) as definition,p.convalidated from pg_constraint p join pg_class c on c.oid=p.conrelid join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relname <> 'sales' and c.relname not like 'sale\\_%' order by c.relname,p.conname")).rows;
    const indexes = (await client.query("select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename <> 'sales' and tablename not like 'sale\\_%' order by tablename,indexname")).rows;
    const enums = (await client.query("select t.typname,e.enumlabel,e.enumsortorder from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' order by t.typname,e.enumsortorder")).rows;
    const triggers = (await client.query("select c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and c.relname <> 'sales' and c.relname not like 'sale\\_%' order by c.relname,t.tgname")).rows;
    const functions = (await client.query("select p.proname,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname not like 'sales\\_%' order by p.proname,p.oid")).rows;
    const sequences = (await client.query("select schemaname,sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value::text from pg_sequences where schemaname='public' order by sequencename")).rows;
    const schemaHash = sha256(JSON.stringify({ columns, constraints, indexes, enums, triggers, functions }));
    return { identity, journal, tables, inventory, sequences, schemaHash, schema: { columns, constraints, indexes, enums, triggers, functions } };
  } finally { await client.query("rollback"); }
}
export function assertJournal(state: Awaited<ReturnType<typeof databaseState>>, allowSales: boolean) {
  const { all } = releaseMigrations(); const expected = all.filter(m => allowSales || m.idx < 9);
  if (state.journal.length !== expected.length || state.journal.some((m, i) => m.hash !== expected[i]?.hash || m.created_at !== String(expected[i]?.when))) throw new Error("Migration journal drift or unexpected pending legacy migrations; refusing release.");
}
function sameLegacy(before: Awaited<ReturnType<typeof databaseState>>, after: Awaited<ReturnType<typeof databaseState>>) {
  return JSON.stringify([before.tables, before.inventory, before.sequences, before.schemaHash]) === JSON.stringify([after.tables, after.inventory, after.sequences, after.schemaHash]);
}
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} must be supplied explicitly.`); return value; }
async function main() {
  const mode = process.argv[2]; if (!["inspect", "migrate-test", "migrate-production"].includes(mode ?? "")) throw new Error("Use inspect, migrate-test or migrate-production.");
  const connectionString = required("SALES_DATABASE_URL"); const url = new URL(connectionString);
  const fingerprint = sha256(url.hostname.replace("-pooler", "") + url.pathname);
  const client = new Client({ connectionString, connectionTimeoutMillis: 15000 }); await client.connect();
  const output = resolve(".vercel/sales-release"); mkdirSync(output, { recursive: true });
  try {
    const before = await databaseState(client); const manifest = releaseMigrations();
    const evidence = { checkedAt: new Date().toISOString(), hostname: url.hostname, database: url.pathname.slice(1), fingerprint, manifest, state: before };
    writeFileSync(resolve(output, "inspection.json"), JSON.stringify(evidence, null, 2));
    if (mode === "inspect") { console.log(JSON.stringify({ readOnly: true, fingerprint, schemaHash: before.schemaHash, migrations: before.journal.length, tables: before.tables.map(t => ({ table: t.table, count: t.count })), manifestHash: manifest.manifestHash })); return; }
    const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/jumbobox_(?:test|sales_[a-f0-9]+)$/u.test(url.pathname);
    if (mode === "migrate-test" && !isLocal) throw new Error("migrate-test is restricted to disposable local databases.");
    assertJournal(before, false);
    if (mode === "migrate-production") {
      // This artifact must be generated from verified platform/backup/test evidence after access is restored.
      const gate = JSON.parse(readFileSync(required("SALES_RELEASE_EVIDENCE"), "utf8")) as {
        commit: string; manifestHash: string; databaseFingerprint: string; schemaHash: string; checkedAt: string;
        vercelProjectId: string; neonProjectId: string; neonBranchId: string; neonEndpointId: string; previousVercelDeploymentId: string;
        productionMappingVerified: boolean; legacySchemaDriftAbsent: boolean; allChecksPassed: boolean; workingTreeClean: boolean;
        backup: { kind: "BRANCH" | "SNAPSHOT" | "DUMP"; id: string; createdAt: string; protected?: boolean; restoreVerified: boolean; databaseFingerprint: string; legacyFingerprintsMatch: boolean };
      };
      const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
      const age = Date.now() - Date.parse(gate.checkedAt); const backupAge = Date.now() - Date.parse(gate.backup?.createdAt);
      if (!Number.isFinite(age) || age < 0 || age > 3600000 || !Number.isFinite(backupAge) || backupAge < 0 || backupAge > 3600000) throw new Error("Release and backup evidence must be fresh (one hour).");
      if (!gate.productionMappingVerified || !gate.legacySchemaDriftAbsent || !gate.allChecksPassed || !gate.workingTreeClean || dirty || gate.commit !== commit || gate.manifestHash !== manifest.manifestHash || gate.databaseFingerprint !== fingerprint || gate.schemaHash !== before.schemaHash || !gate.backup?.id || !["BRANCH", "SNAPSHOT", "DUMP"].includes(gate.backup.kind) || (gate.backup.kind === "BRANCH" && !gate.backup.protected) || !gate.backup.restoreVerified || !gate.backup.legacyFingerprintsMatch || gate.backup.databaseFingerprint === fingerprint || !gate.vercelProjectId || !gate.neonProjectId || !gate.neonBranchId || !gate.neonEndpointId || !gate.previousVercelDeploymentId) throw new Error("Release mapping, backup, commit, schema or validation evidence is incomplete.");
      const phrase = `APPROVE ${commit} ${manifest.manifestHash} ${fingerprint}`;
      if (required("SALES_PRODUCTION_APPROVAL") !== phrase) throw new Error("Separate explicit approval for this exact migration and release is required.");
    }
    await client.query("select pg_advisory_lock(742193, 10)");
    try {
      // Existing workflow, but only after proving the sole pending entries are the two reviewed sales migrations.
      await migrate(drizzle(client), { migrationsFolder: "drizzle" });
      const after = await databaseState(client); assertJournal(after, true);
      if (!sameLegacy(before, after)) throw new Error("Legacy fingerprint mismatch: stop deployment and investigate. Do not drop tables or restore automatically.");
      const objects = (await client.query("select c.relname,count(*)::int as constraints from pg_constraint p join pg_class c on c.oid=p.conrelid where c.relname='sales' or c.relname like 'sale\\_%' group by c.relname order by c.relname")).rows;
      if (objects.length !== 7) throw new Error("Sales constraints missing.");
      const invalid = (await client.query("select conname from pg_constraint p join pg_class c on c.oid=p.conrelid where (c.relname='sales' or c.relname like 'sale\\_%') and not convalidated")).rows;
      if (invalid.length) throw new Error("Unvalidated sales constraints.");
      const indexes = (await client.query("select tablename,indexname,indexdef from pg_indexes where schemaname='public' and (tablename='sales' or tablename like 'sale\\_%') order by indexname")).rows as { indexname: string }[];
      const expectedIndexes = ["sale_allocations_source_idx", "sale_events_sale_created_idx", "sale_items_sale_idx", "sale_items_product_idx", "sale_payments_sale_date_idx", "sale_return_items_allocation_idx", "sale_returns_sale_idx", "sales_created_idx", "sales_status_created_idx", "sales_folio_unique", "sales_idempotency_unique", "sale_events_idempotency_unique", "sale_payments_key_unique", "sale_allocations_movement_unique", "sale_allocations_item_source_unique", "sale_return_items_allocation_unique"];
      if (expectedIndexes.some(name => !indexes.some(index => index.indexname === name))) throw new Error("Expected sales index missing.");
      const triggers = (await client.query("select t.tgname,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and (c.relname='sales' or c.relname like 'sale\\_%') order by t.tgname")).rows;
      if (triggers.length !== 9) throw new Error("Expected immutable sales history guards missing.");
      await migrate(drizzle(client), { migrationsFolder: "drizzle" });
      const second = await databaseState(client);
      if (JSON.stringify(after) !== JSON.stringify(second)) throw new Error("Second migration run was not a no-op.");
      writeFileSync(resolve(output, "migration-result.json"), JSON.stringify({ ...evidence, mode, after, secondRunNoOp: true, legacyUnchanged: true, objects, indexes, triggers }, null, 2));
      console.log(JSON.stringify({ migrated: approvedTags, legacyUnchanged: true, secondRunNoOp: true, journalEntries: after.journal.length }));
    } finally { await client.query("select pg_advisory_unlock(742193, 10)"); }
  } finally { await client.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(JSON.stringify({ event: "sales_release_stopped", errorName: e instanceof Error ? e.name : "UnknownError", reason: e instanceof Error && !((e as Error & { code?: string }).code) ? e.message : "Database operation failed; inspect secured logs." })); process.exitCode = 1; });
