# Quick Add regression review candidate

Validated on 2026-10-05, based on `bdd2f53`. Changes remain uncommitted for review. No deployment, remote migration, production seed, production data mutation, production R2 write/delete, or DNS change was performed. Two read-only schema probes were made against the database configured by `.env.local`; no credentials or product data were printed.

**Release blocker:** that configured remote database lacks `public.products.condition`. The current code requires the existing `drizzle/0007_shiny_sunfire.sql` migration. This task neither creates another migration nor applies the existing migration remotely. The code candidate passes on a compatible disposable database; it cannot repair the remote schema without that separately authorized database operation.

## Requested 29-point report

1. **Existing-product root cause:** on the configured database, `products.condition` is absent. Quick Add's existing-product resolver selects the product's columns under `FOR UPDATE`, including `condition`, and PostgreSQL rejects the SELECT with SQLSTATE `42703`. A read-only remote probe returned `column "condition" does not exist`. The integration regression reproduces the existing-product service failure independently on a fresh database containing migrations 0–6. The failed transaction creates no inventory or movement. Separately, the old shared validator required `compatibilities` on inventory-only input and rejected stale new-product metadata. Both validation defects were demonstrated by failing tests before implementation changes.
2. **New-product root cause:** the same missing database column causes the product INSERT to fail with SQLSTATE `42703`. This was reproduced independently through the new-product service on the disposable pre-0007 schema. Product, stock and movement writes roll back. The new-product form itself passed baseline desktop tests with a fully migrated database, including price, photos and inline locations; there was no evidence of a decimal, enum, FormData or R2 root cause in that baseline.
3. **Relationship:** the two configured-database failures share a schema-version mismatch, at different SQL statements. The existing-only metadata validation defect is an additional, separate issue. After applying the repository's existing migration to the disposable database, both service paths succeed. No remote Quick Add mutation was attempted. The baseline UI runs preceded implementation changes; the schema mismatch was discovered later during the environment audit, then reproduced on the isolated legacy database.
4. **Existing validation:** a Zod discriminated union now has an inventory-only `productMode: "existing"` branch. It requires product ID, location, box selection/creation, positive integer quantity and normalized optional bag. Product master fields are stripped even if supplied. Service entry also parses the contract, rather than relying entirely on its caller.
5. **New validation:** the `productMode: "new"` branch retains catalog/identity requirements, serial duplicate checks, compatible-model limits, decimal-string price rules, MXN, Nuevo/Usado, status/public defaults and box validation. No validation was removed to bypass the database failure.
6. **Existing UI fields:** selected product summary is read-only; the placement step presents Ubicación, Caja, optional Bolsa and Cantidad. Product-master hidden fields are now emitted only in new mode. The confirmation explains that stock in other locations is preserved.
7. **Master data:** inventory-only entry does not call product create/update or upload photos. Integration compares the entire product row, timestamps, compatibilities and serials before/after. Browser tests compare the product row and assert zero image upload/confirmation requests.
8. **Same location:** normalized whitespace/case variants of the bag merge into the existing `UNKNOWN` / `AVAILABLE` lot under the established domain rules in `docs/inventory-rules.md`. The regression verifies 5 + 3 = 8 with one inventory identity. Lot grading and closed/reserved lot semantics remain intact.
9. **Different location:** adding in Caja B creates stock there and leaves Caja A unchanged. Integration and both browser projects verify independent rows and quantities; there is no MOVE or relocation.
10. **Movements/concurrency:** new lots emit `INITIAL`; increments emit `IN`. Existing row locks, stock advisory lock, product SKU/slug locks, movement/audit transaction boundaries and concurrent-add protections remain. The PostgreSQL suite verifies concurrent increments are not lost.
11. **Compatible models before:** compatibility was already represented by product-scoped brand/model associations, and the field had search, multiple selections, removal and a generic `+ Agregar “…”` draft option. That option lacked the explicit word “modelo”; its brand state could stay at an old default. Search fetched an unscoped limited result set before filtering by brand in React.
12. **Agregar modelo:** the field explicitly shows `+ Agregar modelo “Marca Modelo”` following a successful search with no exact match. The action validates/resolves on the server and selects the returned model. A visible confirmation explains that a new draft is saved with the product. Search is debounced at 220 ms, supports mouse and keyboard, marks selected identities, and avoids presenting stale result lists.
13. **Required inline data:** existing active brand plus model text. The compact brand dropdown supplies context; a pasted known brand prefix such as `Hisense 75H78G` selects that brand and separates its model. Existing inline Marca creation supplies new brands. No additional model entity or table is introduced.
14. **Duplicate protection:** the server resolves exact matches using brand ID plus the existing `normalizeModel` identity, reusing the canonical existing display value. Product save retains its server duplicate check and unique `(product_id, brand_id, normalized_model)` constraint. The same model may legitimately be associated with several products; no false global uniqueness constraint was added. Brand-filtered search applies the filter before its limit and groups normalized identities.
15. **Auto-selection/preservation:** resolution appends to selected models, preserving earlier models and all other parent form state. Pending resolution disables navigation/save so a model cannot be lost by advancing mid-request. Tests cover normalized duplicate drafts, keyboard creation, price/serial/photo preservation, saving, edit navigation and reload persistence.
16. **Inline catalogs/locations:** brand/type create and normalized reuse, location create/rename, and inline box creation pass the existing browser and PostgreSQL regressions. No changes to those services were needed.
17. **Photos/direct upload:** selected previews, returning to the form, ordering, primary image, lost-response retry, later-photo failure/retry, exact 10 MiB acceptance, over-limit rejection, direct authorization and confirmation protections pass. Storage tests use local fake R2 only. Existing stock entry makes no image requests.
18. **Publication:** price, MXN, condition, Active/public defaults, explicit private creation, non-public status behavior, `Ver publicación`, canonical catalog paths and public/edit persistence pass. Existing-stock entry never defaults or rewrites these master fields.
19. **Unit tests:** `pnpm test` passed: 196 tests, 40 files; 44 DB tests are skipped in this non-DB run and run separately below. New tests cover inventory-only input, poisoned stale product metadata, inline model authentication/validation/reuse, and brand/model prefix normalization. The two inventory-only regressions failed on the old implementation and now pass.
20. **PostgreSQL integration:** `pnpm test:integration` passed: 44 tests across three files on loopback `jumbobox_test` and a randomly named disposable migration database. Coverage includes same/different placement, master invariance, new creation/publication, inline model resolution/persistence/duplicates, inactive brands, deleted products, stale/inactive parents and boxes, mismatched parents, concurrency, rollback, images and search. The migration test separately proves both `42703` failures before 0007 and success afterward, preservation of legacy rows, and migration idempotence. No new migration was generated.
21. **Desktop E2E:** 20 relevant scenarios verified across the broad regression run and the corrected focused rerun, using Desktop Chromium. Existing entry, new creation, inline model, persistence, catalog inline operations and recent feature regressions pass.
22. **Mobile E2E:** 19 relevant scenarios verified using Pixel 5 Chromium emulation; one existing desktop-only 900×900 viewport scenario intentionally skips on mobile. The four new desktop/mobile regressions passed together in the final focused run. The initial broad run had four failures caused by two test mistakes (ambiguous SQL and reloading before navigation completed); both were corrected and rerun. Database suites were ultimately sequenced with fresh E2E fixtures because integration resets the shared disposable database.
23. **Lint:** `pnpm lint` passed, including the final test code.
24. **Typecheck:** `pnpm typecheck` passed; the production build also completed TypeScript validation.
25. **Build:** `pnpm build` passed with all database/auth/storage environment values overridden by local test fixtures. Existing middleware-to-proxy deprecation remains. The local Open Graph build could not fetch `http://127.0.0.1:3000/logo.svg` after the dev server stopped; the build completed successfully using its existing fallback.
26. **Diff check:** `git diff --check` passed. No environment files, credentials, generated migration files or temporary QA outputs are in the candidate.
27. **Files changed:** the 19-file manifest appears below, including this report. Product/inventory schemas, migration files, deployment configuration and dependencies are unchanged.
28. **Migrations:** zero new migrations. The existing `0007_shiny_sunfire.sql` is a required prerequisite for any database running this code. It was exercised only on disposable PostgreSQL; it was not applied to the configured remote database. Work stopped at the production-change boundary rather than removing condition persistence or inventing a second migration.
29. **Risks/limitations:** the configured remote Quick Add remains blocked until the existing migration is separately reviewed/authorized/applied. A deployed production UI was not mutated or tested end-to-end. Mobile tests are Chromium emulation, not physical iOS/Safari. The documented E2E harness reuses local Neon WebSocket connections; an optional experiment disabling reuse timed out in dashboard connection acquisition before Quick Add and was stopped. That is not a production-runtime certification, and no unrelated pool/runtime changes were made. The confirmed missing-column error is independently established by read-only remote SQL and isolated PostgreSQL reproduction.

## Changed files

Quick Add contract, UI, service and action:

- `src/validators/quick-add-inventory.ts`
- `src/features/inventory/components/quick-add-inventory.tsx`
- `src/features/inventory/server/quick-add-service.ts`
- `src/features/inventory/server/actions.ts`

Compatible-model context, search and inline resolution:

- `src/features/products/domain/compatible-model.ts`
- `src/features/products/server/compatible-model-service.ts`
- `src/features/products/server/compatible-model-actions.ts`
- `src/features/products/components/compatible-models-field.tsx`
- `src/features/products/components/product-form.tsx`
- `src/features/inventory/data/quick-add-queries.ts`
- `src/app/api/admin/compatible-models/search/route.ts`

Regression tests and report:

- `src/validators/quick-add-inventory.test.ts`
- `src/features/inventory/server/actions.test.ts`
- `src/features/products/domain/compatible-model.test.ts`
- `src/features/products/server/compatible-model-actions.test.ts`
- `src/features/admin/server/admin-services.integration.test.ts`
- `src/db/product-condition-migration.integration.test.ts`
- `tests/e2e/quick-add-regressions.spec.ts`
- `docs/quick-add-regression-review.md`

## Validation runs

Windows PowerShell blocks the installed `pnpm.ps1` wrapper, so the equivalent commands used `pnpm.cmd`.

The final broad browser selection was `quick-add-inventory`, `publication-ux`, `direct-image-upload`, `theme-images-search`, `inventory-condition-hero`, and `quick-add-regressions`. The focused corrected rerun was `quick-add-regressions` on both configured projects. Run database-resetting integration and E2E fixtures sequentially. Every writable test connection was loopback/disposable; every storage endpoint was fake/local.
