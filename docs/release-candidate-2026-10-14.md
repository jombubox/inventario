# Reconciled local release candidate — October 14, 2026

This candidate combines the existing Product Edit/inventory UX implementation with the original validated security dependency commit. It is prepared locally for review; nothing is pushed or deployed. The earlier [UX review](product-edit-information-review.md) documents the feature implementation and its prior test evidence.

1. **Initial branch/commit:** `main` at `59fd3f21fcf22c4c04c1968dcc570fd37f186e18`. There were 34 uncommitted UX/report files. That SHA is the user-supplied production baseline; production was not contacted to establish a different release.
2. **Security ancestry:** `a3abde6d1c3a096f67ffd4a0f8db67cf5bfd0f10` was not an ancestor of the initial `main` HEAD. It is a direct child of that HEAD and modifies only `package.json` and `pnpm-lock.yaml`.
3. **Reconciliation:** Created local branch `release/product-edit-security-2026-10-14` directly at the original security commit with `git switch -c ... a3abde6...`. Git carried the uncommitted UX changes across. SHA-256 snapshots of all 34 original files matched after switching. The validated security manifest and lockfile were reused exactly, with no broad upgrades or new overrides. The earlier review is retained as historical evidence and linked to this report.
4. **Next.js:** Manifest, frozen lockfile and freshly installed graph agree on `next`, `@next/env` and `eslint-config-next` **16.3.8**. No alternate installed version appears in the inspected graph.
5. **Wrangler:** The validated manifest range is `^4.149.0`; the frozen lock resolves exactly **4.149.0**. This is staging/build tooling; no Worker deployment is performed.
6. **Sharp:** The freshly installed graph resolves only **0.35.5** through Next.js and Wrangler → Miniflare, including the OpenNext peer graph. Loading Sharp relative to Next.js confirms native `sharp.versions.sharp` is **0.35.5**. No Sharp override or new direct dependency was introduced.
7. **Frozen installation:** Both `pnpm install --frozen-lockfile` and `pnpm install --frozen-lockfile --force` passed. The forced reinstall completed in 5m54.7s, replacing the prior installation; version checks then confirmed all five requested packages. The existing Linux Dockerfile also completed a clean, uncached frozen installation from these exact dependency files.
8. **Security audit:** The repository's exact CI gate, `pnpm audit --prod --audit-level high`, passed (exit 0): **0 high, 0 critical, 2 moderate**. A wider development-inclusive audit reports **3 high and 5 moderate**, so the full graph is **not clean**. No advisory was suppressed. Neither Next.js nor Sharp appears in either advisory result. Remaining findings and their scope are recorded below.
9. **Product Edit photos:** The existing photo manager remains near the top of Product Edit, loading persisted photos through the authenticated server detail query. It reuses the wizard's validated picker/upload hook and shared original-image viewer. Add, preview, order, primary, alt editing, removal, progress and retry behavior remain. Upload cleanup clears only confirmed IDs, preserving newer selections. Dedicated photo/persistence cases passed on desktop and mobile (4/4), including reload, saved-product data, failure/retry, thumbnails and both themes at all requested widths.
10. **Origen/Fecha/Notas:** Continue using `inventory_items.acquisition_source`, SQL `DATE` `acquired_at`, and `notes`; they are per-entry provenance. Step 5 and Inventory Edit use the shared optional fields. Distinct provenance creates a separate entry instead of rewriting historical stock. Dates are validated calendar values adapted to the existing UTC DATE mapper; multiline notes remain plain text and survive edits/export. Product master updates do not write these fields. Final PostgreSQL persistence tests passed, including separate-source entries, editing/export and historical-row preservation.
11. **Contrast:** Existing semantic action tokens remain **#2D6FEA / #FFFFFF**, measured **4.59:1** for normal-size text. Brand primary remains #2F73F2. Label sizes, disabled styling and separate outline/ghost/secondary/destructive variants are preserved. Light/Dark and focus contrast tests remain in the suite.
12. **Unidentified bar:** Separate pending visual clarification about its label/action. No unrelated navigation, tab or progress bar is replaced. It does not block dependency reconciliation.
13. **Wizard:** Five steps remain. Existing brand/type autocomplete and inline creation, part/serial identifiers, compatible models, photos, placement/quantity, MXN price, derived availability, warranty months/Sin garantía, Usado default, publication and visibility are preserved. Final desktop/mobile wizard regressions passed, including Back/Next persistence, final submission/reset, layouts, optional fields, cancellation and stale-reference rollback.
14. **Inventory:** The existing-product fast stock-entry flow remains independent of the new-product wizard. It supports optional provenance, safe same-identity increments, distinct sources/boxes/bags, existing blank metadata and Inventory Edit/reload. Final desktop/mobile regressions passed, retaining product master values and historical entries while adding only the requested quantity.
15. **R2/images:** Production R2 is not contacted or modified. Browser tests use the existing fake local R2. PNG/JPEG/WebP, exact 10 MiB validation, direct browser PUTs, secure authorization, server verification, batch order, primary changes and retry-safe registration are unchanged. Final desktop/mobile direct-upload and image regressions passed, including 6 MiB/exact 10 MiB files, failed-upload retry, lost-success-response retry, signed PUT restrictions, original-image viewing/desktop zoom, previews, and saved-object overwrite prevention.
16. **Unit tests:** Final `pnpm test` passed **298 tests across 48 files**, matching the prior baseline and including the 50 PostgreSQL tests.
17. **PostgreSQL:** All writable validation uses disposable `127.0.0.1:54330/jumbobox_test`; integration and browser fixture resets are sequenced. Final explicit `pnpm test:integration` passed **50 tests across 4 files**, matching the prior baseline.
18. **Desktop/mobile:** Final full `pnpm test:e2e` passed **73 tests with 15 existing intentional skips, zero failures** in **9.1 minutes**, matching the prior baseline. Both configured Chromium projects ran against disposable PostgreSQL/fake R2 with the final approved palette and fresh dependency graph. This full run includes the previously verified 35 palette cases; those are not counted again. Skips remain existing device-specific/stateful-flow exclusions and remote staging cases. No expectations were lowered.
19. **Lint/typecheck/build/diff:** Final `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. The build retains the existing middleware-to-proxy deprecation notice.
20. **Linux OpenNext:** **Passed** using existing `Dockerfile.ci`, target `opennext-artifact`, Linux Node 22 and `pnpm cf:build`. The first uncached run completed installation/build but Windows rejected Linux symlinks during local-directory export. A second run reused that clean-install layer and successfully exported `.git/reconcile-opennext.tar`; its worker and default server handler were verified present. Only dummy/local preview build values were supplied. No preview server, upload or deploy command was run.
21. **Migrations:** None added or changed. No Neon migration or production seed is run. Existing migration compatibility tests execute only against disposable PostgreSQL.
22. **Changed files:** The security commit contributes exactly the two dependency files. All 34 original UX/report files are retained; this report is added. Exact final paths are listed below.
23. **Candidate:** The final candidate is the committed tip of local branch `release/product-edit-security-2026-10-14`; its exact SHA and clean-tree verification are recorded in the final handoff and ignored local receipt `.git/reconcile-candidate.json` (a commit cannot contain its own SHA). The original security commit remains in the ancestry. No push is performed.
24. **Promotion readiness:** Dependency reconciliation and every requested local validation passed. The candidate is ready for release review, with the Next.js/Sharp fixes and all UX work together. The CI production-audit gate passes, but residual full-graph advisories still require review; this report is not a claim that the complete audit is clean. Production promotion requires the user's separate authorization. The production baseline/main ref and rollback commits remain available. The unidentified bar remains an independent visual clarification.

## Remaining audit findings

These findings are retained from the validated dependency graph, not hidden with audit exceptions. Advisory mechanisms below come from the linked primary advisory pages; the path classifications come from this candidate's audit. Reachability notes are limited code-review inferences, not a complete exploitability assessment.

| Package / severity | Resolved dependency path | Advisory / review |
| --- | --- | --- |
| uuid / moderate, production | ExcelJS → uuid | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq): missing output-buffer bounds validation in v3/v5/v6. The inspected ExcelJS use calls v4 without a supplied buffer; no affected call was found there. This does not remove the audit finding. |
| brace-expansion / moderate, production and lint | ExcelJS → archiver → archiver-utils → glob → minimatch; ESLint → minimatch | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr): untrusted brace patterns can cause quadratic CPU use. Existing v1 override remains 1.1.20; advisory fix is 1.1.21. Inspected ExcelJS archive-writing calls append fixed/generated member names; no glob call was found in that file. This is a limited inference, not a waiver. |
| js-yaml / high, lint tooling | ESLint → @eslint/eslintrc → js-yaml | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh): repeated empty YAML merges can consume excessive CPU; patched v4 is 4.3.2. Not in the `--prod` audit result. |
| braces / high, lint tooling | eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested patterns can exhaust the stack. The advisory currently lists no patched version. Not in the `--prod` audit result. |
| source-map-js / high, build tooling | @tailwindcss/postcss → @tailwindcss/node → source-map-js | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q): malicious indexed source-map offsets can block the event loop; patched at 1.2.2. Not in the `--prod` audit result. |
| esbuild / moderate, migration tooling | drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99): development-server cross-origin access; patched at 0.25.0. No esbuild serve endpoint was started in this validation. |
| vitest and @vitest/mocker / two moderate entries, test tooling | Vitest; Vitest → @vitest/mocker | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9): redirect mocks can read files outside allowlists under exposed dev-server preconditions; patched at 4.1.11. This repository runs Vitest in Node mode, not a public mocker/browser server. |

The wider audit's 5 moderate entries count Vitest and @vitest/mocker separately and share the production brace-expansion advisory with lint. The production gate deliberately checks production dependencies at high severity; its passing exit is not evidence that the wider audit has no high findings. Further unrelated upgrades are outside this focused reconciliation; no new overrides were added.

## Local evidence and safety

Ignored local logs/receipts live under `.git/reconcile-*`: original-file snapshots, original UX diff, install logs, installed graph, Sharp paths, CI audit log, production/full JSON audits, Linux build log, regression logs and final candidate receipt. Production and full JSON audit outputs include moderate findings and may return nonzero even while the exact non-JSON CI severity gate passes; the exact CI command's exit is reported separately.

All database/site/authentication/storage values for host tests are explicitly overridden to disposable loopback resources. The Docker build excludes `.env*`, `.git` and host `node_modules`, and receives dummy/local build values. No production data, R2 configuration/objects, DNS, platform variables, migrations or deployments are changed.

## Changed files relative to the original baseline

```text
docs/product-edit-information-review.md
docs/release-candidate-2026-10-14.md
package.json
pnpm-lock.yaml
src/app/admin/auditoria/page.tsx
src/app/admin/marcas/page.tsx
src/app/admin/movimientos/page.tsx
src/app/admin/productos/[id]/page.tsx
src/app/admin/tipos-de-pieza/page.tsx
src/app/globals.css
src/components/ui/page-header.tsx
src/features/admin/server/admin-services.integration.test.ts
src/features/images/components/photo-selection.tsx
src/features/images/components/product-image-manager.tsx
src/features/imports/domain/import-normalization.test.ts
src/features/imports/domain/import-normalization.ts
src/features/imports/server/import-analyzer.ts
src/features/imports/server/xlsx-parser.test.ts
src/features/imports/server/xlsx-parser.ts
src/features/inventory/components/inventory-forms.tsx
src/features/inventory/components/inventory-information-fields.tsx
src/features/inventory/components/quick-add-inventory.tsx
src/features/inventory/server/actions.test.ts
src/features/inventory/server/actions.ts
src/features/inventory/server/quick-add-service.ts
src/features/products/components/product-form.tsx
src/features/products/components/products-table.tsx
src/features/theme/action-contrast.test.ts
src/validators/admin-inventory.ts
src/validators/inventory-information.test.ts
src/validators/inventory-information.ts
src/validators/quick-add-inventory.ts
tests/e2e/admin-security.spec.ts
tests/e2e/product-edit-information.spec.ts
tests/e2e/quick-add-inventory.spec.ts
tests/e2e/quick-add-wizard.spec.ts
tests/e2e/theme-images-search.spec.ts
```
