# Sales implementation and validation receipt

November 5, 2026. Application candidate: `ed70f39` on `feat/admin-sales-management`, based on `56fbf6f`. No push, merge, Vercel deployment, production migration, production seed, production stock write, DNS change, R2 configuration change or runtime-variable change was performed.

## Delivered behavior

The module includes the sales dashboard/history/search/filters/pagination, five-section new-sale form, exact source selection, customer/delivery snapshots, integer MXN pricing/discounts/tax, unpaid/partial/multiple payments, draft completion, atomic SALE ledger entries, retry protection, delivery updates with before/after audit, cancellations, partial sellable/damaged/no-restock returns, separate actual-refund records, receipts with print/PDF, daily/monthly and operational reports, CSV exports and server-side admin protection. Public desktop/mobile admin navigation is removed; private authentication and routes remain.

See [module architecture and operating model](sales-management.md) for table purposes, financial equations, lock order, archive behavior, privacy and feature limits. See [production release plan](sales-production-release.md) for the executable migration/deployment/recovery procedure and current access blockers.

## Executed checks

The isolated worktree `C:\Users\yo\Desktop\work\JumboBox-sales-review` contains the candidate without the pre-existing R2 changes and without `.env.local`. Its dependencies were installed with `pnpm install --offline --frozen-lockfile`. Its synthetic database is a separately created local PostgreSQL 18.6 container (`jombubox-sales-review18`, loopback port 54332, `jumbobox_test`).

| Check | Observed result |
| --- | --- |
| Drizzle generation consistency | Passed; no additional schema changes/migration generated |
| Full unit and PostgreSQL integration suite, isolated commit | **379 passed**, 56 files, no skipped suites; PostgreSQL 18.6 |
| Lint | Passed |
| Typecheck / Next production compilation | Passed |
| Next production build, isolated commit | Passed |
| Linux OpenNext build using `Dockerfile.ci`, isolated commit | Passed, including fresh frozen installation and Next production build |
| Production dependency audit at high threshold | Passed: 0 high/critical, 7 moderate |
| Full dependency audit | 0 high/critical, 8 moderate; existing advisories are not suppressed |
| Full browser suite, shared working tree including preserved pending R2 work | **103 passed, 15 existing skips**; desktop/mobile, local PostgreSQL 18.6 and fake R2 |
| Full browser suite, isolated commit | **89 passed, 15 existing skips**, 16.6 minutes, desktop/mobile; no failures |

The shared working-tree suite previously passed 398 tests on PostgreSQL 18.6 and 397 on PostgreSQL 17 before the final sales hardening. The final isolated-commit result above is the release-relevant test count; it excludes the user's pending R2 files/tests. The difference is recorded rather than silently incorporating those files.

Browser coverage includes authenticated/anonymous access, product creation/editing and SKU behavior, stock locations/boxes/bags, imports/exports, images and direct fake-R2 uploads, archived records/restoration, marquees, WhatsApp quotations, light/dark themes and responsive layouts. The sales cases exercise form state across backward navigation, product search/source selection, shipping/customer/payment, confirmation, history filters/CSV, delivery tracking, damaged returns, refunds, cancellation and the receipt in screen/print media, on both devices. A PDF and print/history screenshots were generated from synthetic sales. Remote-staging cases and duplicate device-specific cases retain their existing skip conditions; no production test data was created.

## Migration proof

| Migration | SHA-256 |
| --- | --- |
| `0009_sales_management.sql` | `70188496e4df06bdbcc1be5574c2e49f560970f71ec50b3bd8f4b4a10ef445fa` |
| `0010_sales_history_guards.sql` | `c7e34515733cfe70fcb2354afe3b386aeb44830e1f344ff117172b9691968df6` |

Reviewed manifest SHA-256: `ff5740999e59a1ba911157b79efc6e1cbef7962343fd6273876b0301aa6beb1c`.

The real `sales:release migrate-test` executable was run by the migration integration test against a generated, isolated legacy database. It first proved production mode refuses missing evidence/approval without changing the database. The test then applied the two reviewed sales migrations, preserved legacy ACTIVE/ARCHIVED/DRAFT products, stock/locations/bags, historical movements, legacy identities, row fingerprints, inventory totals and sequence state; validated eleven journal entries, seven new tables, 23 indexes and nine history triggers; and proved a second migration run is a no-op. The generated fixture database was dropped in cleanup. Both PostgreSQL 17 and 18.6 rehearsals passed. No Drizzle migration journal was rewritten or falsely baselined.

Transactional sales coverage includes exact single/multiple products/sources, competing sales, insufficient stock, injected audit failure rollback, simultaneous duplicate submissions, changed-payload rejection, non-reserving drafts, stock/location revalidation, draft completion, cancellation once, partial and concurrent returns, damaged stock separation, no-physical-receipt handling, multiple/concurrent payments, refunds/overpayment limits, archived/deleted/ineligible records, immutable snapshots and fulfillment changes. HTTP tests prove authentication runs before all queries/actions/exports, reject malformed bodies and cap streamed payloads despite forged Content-Length. Money and CSV tests cover exact cents, discounts, overflow, balance equations, unique folios, return bounds, Mexican phones, shipping/date validation, Spanish validation errors and formula injection.

## Production readiness and limitations

The configured Neon endpoint was inspected in explicit read-only transactions. Its nine migration hashes/timestamps match the reviewed history (including the recorded CRLF format of `0007`), and its complete legacy schema matches a PostgreSQL 18.6 rehearsal. It is still **not verified as the current Vercel Production database**: Vercel project/domain/environment API access returns 403 and Neon management is not connected. The browser/desktop fallback could not start because its automation runtime requires a newer host Node version. No host Node installation or platform credential/access changes were made.

Backup/protected-branch creation, restore proof, fresh production fingerprints under a coordinated write pause, current deployment/rollback verification, exact release authorization, production migration, deployment and production read-only smoke/log checks remain blocked/deferred. These have an explicit procedure and executable migration guard in the release plan; they are not unspecified manual migration work. Production approval must be requested only after the missing platform evidence and recovery proof exist.

The application deliberately uses one-time customer snapshots, explicit monetary return credits, separately recorded actual refunds, browser Save as PDF, bounded sales/exports and cohort reports. Saved drafts are completed/cancelled; changed draft items require a new draft. Archived products/locations must be restored before physical restocking. These choices and their operational implications are documented in the module guide.

## Preservation and source status

The six original modified R2/upload files and four original untracked R2 files were left outside the sales commits. SHA-256 checks verified all ten remained unchanged through the work. Branding, public marquees, images and existing auth were reused. The clean review worktree has no source modifications. Feature/checksum commits are local only; a final documentation-only receipt commit may follow this tested application commit.

The local test containers are retained stopped for reproducibility; no database credentials or environment files are copied to the clean review worktree. Start its database with `docker start jombubox-sales-review18`, then use `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54332/jumbobox_test` with the verification harness. E2E starts its own fake R2 and WebSocket proxy and resets only this guarded synthetic database. Production release evidence and backup proof are still incomplete, so no production approval phrase has been issued or populated.

Changed paths relative to the starting commit follow (the complete generated snapshots are included because Drizzle requires them).

```text
.dockerignore
.gitattributes
docs/sales-management.md
docs/sales-production-release.md
docs/sales-validation.md
drizzle/0009_sales_management.sql
drizzle/0010_sales_history_guards.sql
drizzle/meta/0009_snapshot.json
drizzle/meta/0010_snapshot.json
drizzle/meta/_journal.json
package.json
src/app/admin/ventas/[id]/page.tsx
src/app/admin/ventas/[id]/recibo/page.tsx
src/app/admin/ventas/[id]/recibo/receipt.css
src/app/admin/ventas/error.tsx
src/app/admin/ventas/loading.tsx
src/app/admin/ventas/nueva/page.tsx
src/app/admin/ventas/page.tsx
src/app/api/admin/sales/[id]/route.ts
src/app/api/admin/sales/export/route.ts
src/app/api/admin/sales/route.ts
src/app/api/admin/sales/stock/route.ts
src/components/layout/admin-breadcrumbs.tsx
src/components/layout/admin-nav-link.tsx
src/components/layout/admin-navigation.ts
src/components/layout/public-header.tsx
src/components/layout/public-mobile-menu.tsx
src/db/sales-migration.integration.test.ts
src/db/schema/index.ts
src/db/schema/sales.ts
src/features/inventory/server/inventory-service.ts
src/features/sales/components/new-sale.tsx
src/features/sales/components/sale-controls.tsx
src/features/sales/components/sales-fields.tsx
src/features/sales/data/sales-queries.ts
src/features/sales/domain/sales-csv.test.ts
src/features/sales/domain/sales-csv.ts
src/features/sales/domain/sales.test.ts
src/features/sales/domain/sales.ts
src/features/sales/domain/validation.ts
src/features/sales/server/sales-http.test.ts
src/features/sales/server/sales-http.ts
src/features/sales/server/sales-service.ts
src/features/sales/server/sales.integration.test.ts
src/scripts/sales-release.ts
src/scripts/sales-verify.mjs
tests/e2e/sales.spec.ts
```
