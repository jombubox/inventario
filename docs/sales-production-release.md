# Sales migration and production release

Status on November 5, 2026: implementation and disposable validation complete; **production authorization is not yet requested**. Platform access must be restored to finish the mapping and recoverability checks first. Production database, deployments, DNS, runtime variables and R2 configuration have not been changed.

## Reviewed migration scope

Apply in this order through the existing Drizzle migration workflow:

1. `drizzle/0009_sales_management.sql`: seven new sales tables and their FKs/checks/indexes.
2. `drizzle/0010_sales_history_guards.sql`: immutable-history and monotonic-allocation guards, on the new tables only.

The journal and snapshots are generated with `drizzle-kit generate`; the history guard is a custom Drizzle migration. No legacy ALTER/UPDATE/DELETE, data backfill, migration baseline, enum extension, production seed or stock update is required. The old application is compatible with these unused additive tables. The new application must be deployed **after** the migrations. Application rollback leaves the additive database schema intact.

File hashes and timestamps are read directly from the reviewed files/journal by `src/scripts/sales-release.ts`; its manifest hash binds the entire exact migration set. The script refuses unexpected pending legacy migrations or any changed/missing history hashes, refuses production without complete release evidence and separate exact approval, and runs no seed.

## Observed access and configured database (not verified Production mapping)

- Local Vercel project: `inventario`, ID `prj_KWZfgwAThqxjQEGnw6uLdT2b00ck`, team `team_j42lHQgbpwiArl0XQooTmBK6`.
- Current CLI and read-only API calls for project, `www.jombubox.com` alias and production environment metadata return **403 forbidden**. Local cached deployment IDs are historical, not evidence of the current deployment or rollback eligibility.
- `.env.local` connects to endpoint `ep-sparkling-frost-axqsc8oi`, database `neondb`, PostgreSQL **18.6**. This endpoint's relationship to current Vercel Production remains **unverified**; its Neon project/branch IDs cannot be inferred safely from a hostname.
- A read-only repeatable-read inspection found nine journal entries, each SHA-256/timestamp matching `0000`–`0008`. No sales tables exist there.
- Recorded counts: 74 products, 79 inventory entries, 80 AVAILABLE units, 79 historical movements, 286 product images. All 20 legacy tables have private count/fingerprint evidence. Two read-only inspections produced unchanged table fingerprints and inventory totals.
- Legacy columns, effective constraints and indexes match a database migrated from this repository. PostgreSQL 18 exposes NOT NULL in `pg_constraint`, unlike 17; nullable-column metadata matches and this representation difference is excluded from semantic drift. Tests also run on disposable PostgreSQL 18.6.
- Evidence is local and ignored under `.vercel/sales-readiness*.json` and `.vercel/sales-legacy-drift.json`. These snapshots are **not backups** and become stale as real operations continue.
- No Neon management connection is currently confirmed. No backup/protected branch was created, and no restore was falsely claimed.

## Finish prerequisites before approval

1. Restore authorized access to the existing Vercel team/project and connect Neon. Do not relink/create a new production project to work around the 403.
2. Read the live domain alias, Production deployment ID/commit, project settings, actual Production `DATABASE_URL` and deployment overrides in a secure context. Record only redacted identity metadata. Resolve the connection's exact Neon project, branch, endpoint, role and database through Neon management data. Compare this with the app's runtime configuration; require matching identities.
3. Re-run read-only inspection with the **verified** production URL supplied explicitly as `SALES_DATABASE_URL`. Compare all existing journal hashes/timestamps, tables, columns, enum definitions, constraints, indexes and custom triggers/functions against the release baseline. Stop on unexplained drift; never use `drizzle-kit push` or rebaseline production.
4. Coordinate a brief pause of administrative writes. Capture fresh fingerprints/counts, full SKU/product row digests, per-product/status inventory totals, movement digests, identity/history digests and the inventory sequence. Do not create test records in production.
5. Create a fresh Neon snapshot or protected branch from the verified production branch. If neither is available, use the established encrypted `pg_dump --format=custom --no-owner --no-acl` backup process with checksum and separate private retention. Capture the exact branch/snapshot/dump identity, timestamp/LSN and retention.
6. Restore/clone the backup to a separate recoverability-test branch/database. Connect to that target, verify its distinct endpoint, matching legacy fingerprints, schema and journal, and document duration and recovery access. A named branch or a successful backup API response alone is insufficient. Keep the backup protected and the test target isolated. See [Neon snapshots](https://neon.com/blog/announcing-neon-snapshots-a-smoother-path-to-recovery) and [protected branches](https://neon.com/blog/restrict-access-to-the-production-branch).
7. Use a clean checkout containing only the reviewed release. Preserve unrelated R2 work separately. Run the frozen dependency/CI checks and all regression suites on the exact application commit, with disposable PostgreSQL and fake R2 only. Record remaining advisory severity accurately.
8. Confirm the actual Vercel production Git branch/deployment workflow and retain the current successful deployment as the rollback target. Confirm its eligibility/retention, domain aliases and source SHA. Do not assume a historical cached deployment is still available.
9. Produce a reviewed evidence JSON with exact commit, manifest hash, target fingerprint/schema hash, live Vercel/Neon IDs, backup/restore proof and passing checks. Request the user's **separate explicit approval for that exact migration and application release**. Never set approval flags on the user's behalf before approval.

## Executable migration procedure

The release tool never loads `.env.local`. Supply `SALES_DATABASE_URL` from the verified secure connection. Never paste the URL into logs or a committed document.

```powershell
# Read-only: generates ignored inspection evidence and prints only safe summaries.
pnpm sales:release inspect

# Only after the reviewed evidence and separate explicit user approval exist:
# SALES_RELEASE_EVIDENCE points to the private evidence JSON.
# SALES_PRODUCTION_APPROVAL must equal:
# APPROVE <exact-commit> <migration-manifest-sha256> <database-fingerprint>
pnpm sales:release migrate-production
```

The production command fails closed unless mapping, schema, backup restore, clean exact commit and validation evidence are complete/fresh (one hour). It validates all pre-sales history, holds an advisory release lock, runs the existing Drizzle migrator with **only these two pending migrations**, checks all eleven journal entries, compares complete legacy fingerprints/totals/schema, verifies new constraints, then executes the migrator a second time and proves the result unchanged. Private pre/post evidence is saved to `.vercel/sales-release/`. Hold administrative writes until integrity verification completes.

For disposable local migration rehearsal, use `migrate-test` with an explicitly supplied loopback `jumbobox_test` or generated `jumbobox_sales_<hex>` URL. The integration test invokes this real executable against a legacy fixture, verifies the production mode refuses absent approval, validates historical data preservation, checks the new objects and proves idempotency. The ordinary `db:migrate` command remains unchanged; do not run it with ambient production credentials as a shortcut around release checks.

Private release evidence schema (populate from actual verified results, never invented booleans):

```json
{
  "commit": "<tested clean commit>",
  "manifestHash": "<inspection manifestHash>",
  "databaseFingerprint": "<verified target fingerprint>",
  "schemaHash": "<inspection schemaHash>",
  "checkedAt": "<fresh ISO UTC>",
  "vercelProjectId": "<live project>",
  "neonProjectId": "<live project>",
  "neonBranchId": "<verified Production branch>",
  "neonEndpointId": "<verified Production endpoint>",
  "previousVercelDeploymentId": "<verified available rollback target>",
  "productionMappingVerified": true,
  "legacySchemaDriftAbsent": true,
  "allChecksPassed": true,
  "workingTreeClean": true,
  "backup": {
    "kind": "SNAPSHOT",
    "id": "<fresh recoverable backup identity>",
    "createdAt": "<fresh ISO UTC>",
    "protected": false,
    "restoreVerified": true,
    "databaseFingerprint": "<distinct restored-test endpoint identity>",
    "legacyFingerprintsMatch": true
  }
}
```

`kind` is BRANCH, SNAPSHOT or DUMP. A BRANCH must also be protected. `databaseFingerprint` in the backup object identifies the distinct target used to prove recovery. Preserve the actual detailed proofs alongside this gate, including restore/fingerprint logs and platform responses. This evidence file is an execution gate, not a substitute for the checks it records.

## Application deployment and post-release checks

After the approved migration passes, release the **matching tested commit** through the verified existing Vercel Production workflow. If it is Git-connected `main`, merge/push only as part of that approved release after the migration is complete; do not use the repository's historical Cloudflare `deploy` script for this Vercel release. Verify Vercel's deployed source SHA matches the approved SHA, environment mapping and expected domain aliases.

Run read-only production smoke tests: health, home/catalog/images/WhatsApp links, anonymous sales API/export rejection, anonymous `/admin` redirect, authenticated existing admin dashboard, product/inventory/archive screens, sales list/report loading and empty/new-sale stock search. Open an existing real completed sale/receipt only when one exists; **do not create synthetic sales/customers/payments/returns**. Inspect deployment/runtime logs for database failures, failed auth, sale exceptions and 5xx. Recheck product/SKU/inventory/movement digests before reopening writes and retain the previous Vercel deployment. Record timestamps and statuses without customer PII.

## Recovery

Prefer application rollback to the verified previous Vercel deployment if the new app fails. [Vercel rollback](https://vercel.com/docs/deployments/rollback-production-deployment) changes application routing; it does not reverse database migrations or financial/inventory operations. The old app can run with the unused additive sales tables. Do not delete sales tables, remove journal rows or run automatic down migrations.

If a migration transaction fails, inspect the actual journal/schema before retrying. A successful additive migration with an application error generally needs only app rollback. A genuine database-integrity incident requires stopping writes, preserving incident evidence and creating a separate recovery branch from the verified backup/snapshot/LSN (or restoring the verified custom dump to a new database). Compare fingerprints there first. If any genuine sales/stock movements occurred after the backup, reconcile them before changing the production endpoint; blanket restore can lose legitimate operations. Endpoint switching/PITR is a separate reviewed recovery action and may require additional explicit approval. Never assume app rollback restores stock or customer data.
