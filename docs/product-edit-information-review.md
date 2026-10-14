# Product Edit and inventory information review

This is the historical UX-only review. The dependency mismatch recorded below is reconciled in the [October 14 security-patched release candidate](release-candidate-2026-10-14.md).

Local review candidate for October 13, 2026, on `main`, based on `59fd3f2`. The starting working tree was clean. Existing commits, package manifests, lockfile and security/upload authorization code were preserved. Next.js guidance was read from the installed package before implementation.

All writable validation used disposable PostgreSQL at `127.0.0.1:54330/jumbobox_test` and fake R2 at `127.0.0.1:5555`. No deployment, production mutation, remote migration, seed, R2 object/configuration change, DNS change or environment-variable change was performed.

1. **Why photos appeared missing:** The existing Product Edit route already rendered `ProductImageManager`, but below the entire master-data form and its Save button. Its upload control was a native file input. The manager now appears near the top of Product Edit, before the master-data form, under **Fotos del producto** with a visible **+ Agregar fotos** button.
2. **Loading existing photos:** The authenticated server page continues using `getAdminProductDetail`, which loads the product's associated image records and resolves their R2 public URLs. The manager orders them by existing primary flag and persisted `sortOrder`. No separate data store or uploader was introduced.
3. **Photo behavior:** Existing and selected photos can be previewed with the shared `ImagePreview`/`Modal` components. Product Edit continues using the wizard's validated `PhotoSelection` and `usePhotoUploads`. Existing controls retain alt-text editing, reorder, primary selection and deletion. The principal badge now reads **Foto principal**. Image changes save immediately; the section explains this. Promoting or reordering uses the established first-image-is-primary semantics. New photos append to existing images.
4. **Retry and failure safety:** The existing direct browser-to-R2 authorization/PUT/confirmation path is unchanged. JPEG/PNG/WebP, 10 MiB, signatures, secure authorization, server verification, idempotent upload IDs, progress and retry behavior remain. Failed files show errors and retry controls; confirmed files are not reuploaded. Partial upload failures retain existing photos and restore batch order on retry. A refresh-cleanup race found by mobile testing was fixed by clearing only files whose IDs are already confirmed, preserving newer selections. Uploaded previews disappear after registration instead of duplicating persisted thumbnails. Image mutations are disabled during uploads/errors/refreshes to avoid changing batch order before retry completes.
5. **Existing fields:** `inventory_items.acquisition_source`, `inventory_items.acquired_at` (SQL `DATE`), and `inventory_items.notes` already existed, along with inventory services, queries, edit forms and spreadsheet mappings. Product creation/update timestamps remain system-generated and unchanged.
6. **Domain ownership:** Origen, Fecha and Notas describe a specific inventory record, rather than every unit of a product master. Quick Add merges stock only when product, box, bag, condition/status and all three provenance values match. Different provenance creates a separate entry, preserving historical values and quantities. The existing advisory lock and stock movement services remain in use.
7. **Creation:** The five-step wizard includes **Información adicional** in Step 5, **Inventario y publicación**, after placement/quantity. The three fields are optional. The short existing-product stock-entry flow exposes the same fields in an optional expandable section and does not introduce wizard steps or require product metadata. Standalone inventory creation also uses the same fields and resets them after successful creation.
8. **Editing:** Stored values are visible/editable in **Editar inventario → Datos físicos → Información adicional**. They are intentionally absent from the product master form. Product Edit's existing inventory destination remains available. Unrelated product changes do not write stock provenance; inventory detail updates continue using optimistic concurrency and do not alter stock quantities.
9. **Date semantics:** Existing inventory/import conventions establish **Fecha** as the acquisition date of these existences. The interface states this explicitly. Form values are `YYYY-MM-DD`; server validation rejects invalid calendar dates, rollover dates, year zero, locale-formatted strings and timestamps. At the existing Drizzle SQL `DATE` boundary, the calendar value becomes a UTC-midnight `Date`, and edit forms read its ISO calendar portion. No local-time conversion, timestamp default or publication-date inference is used.
10. **Persistence:** Quick Add forwards validated provenance to `createInventoryItemInTransaction` within the existing product/location/stock transaction. Inventory Edit uses `updateInventoryDetails` with the current `updatedAt` concurrency token. Blank values are stored as null. Source is bounded to 500 characters and notes to 5000; notes preserve punctuation, Spanish text and line breaks and render as plain text. Export continues using existing typed date/source/notes columns and spreadsheet formula protection. Import now recognizes the export's `Notes` header and preserves multiline internal notes instead of flattening them.
11. **Migration:** None. No schema or historical migration changes were needed or applied.
12. **Existing data:** Existing null values display blank. No historical source, date or notes were fabricated or backfilled. Product master edits leave inventory rows unchanged. Unsourced historical entries remain intact when new sourced stock is added.
13. **Reported bar control:** The missing visual reference and unspecified action do not identify a unique Product Edit bar. Potential references include the inventory navigation card or old native photo chooser, but neither can be confirmed as the intended control.
14. **Button/clarification:** The native photo picker now has a prominent primary **+ Agregar fotos** trigger as part of the photo-management request. No other unidentified bar, navigation card, progress indicator or tab was replaced. Clarification is still needed about the label/action of the reported Product Edit bar.
15. **Primary button colors:** The user chose a slightly darker action blue so the existing label sizes can meet AA. Shared action tokens use **`#2D6FEA` with `#FFFFFF` text** in Light and Dark; the brand `--primary` remains `#2F73F2`. Primary hover/active colors are darker to maintain readability. Remaining solid admin search/filter and inventory-navigation actions use `buttonStyles`; outline, ghost, secondary and destructive variants retain their separate colors.
16. **Contrast and themes:** White on the original brand blue measures **4.33:1**, below AA for normal-size text. The user-approved `#2D6FEA` action blue measures **4.59:1**, meeting AA for the existing normal-size labels. Keyboard tests verify visible focus rings and button activation. Light/Dark background and card palettes remain unchanged. Long product titles/SKU previews wrap to avoid the tablet overflow found in browser checks. Final unit and browser color checks passed, including default/hover/active contrast and unchanged outline-button styling. Screenshots were visually reviewed at the requested widths in both themes.
17. **Wizard regression:** The complete wizard was exercised on desktop/mobile with all five steps, autocomplete/inline catalog creation, serials, models, photos, stock, price, warranty, Usado default and publication. New fields survive Back/Next, final submission, database reads and wizard reset. Width-specific tests check scrolling/footer visibility, optional fields and both themes at 1440×900, 900×900 and 393×727. Passed in the full browser suite; also included in the final palette rerun.
18. **Existing-product Quick Add:** Focused desktop/mobile cases passed: stock-only entry has no wizard progress bar, stores provenance, retains the product master and existing inventory rows, and changes only the requested added quantity. Existing regression coverage for blank metadata and same/different boxes/bags remains. Passed in the full browser suite; also included in the final palette rerun.
19. **Product Edit E2E:** The dedicated suite passed **4/4** desktop/mobile tests. Photo coverage includes existing photos, single/multiple additions, local preview, partial failure/retry, order, primary, removal, reload, master Save, catalog/admin thumbnail refresh and both-theme layouts. Metadata coverage includes stock-only entry and Inventory Edit/reload with exact dates and multiline plain-text notes.
20. **Image/R2 regression:** Both projects passed the direct-upload checks after the cleanup fix, including 6 MiB and exact 10 MiB uploads, small JSON requests to the app, failed uploads followed by retry, authorization failures, signed PUT restrictions, and prevention of overwriting saved objects. All storage was fake/local; production R2 was not touched. Passed in the full browser suite; photo add/edit/retry/order/primary cases are also included in the final palette rerun.
21. **PostgreSQL:** `pnpm test:integration` passed **50 tests across 4 files**. Includes new per-entry provenance/separate-source/edit/export coverage, complete wizard provenance, preserved product master data, unchanged historical rows and existing concurrency/rollback/image/import/stock checks. Existing migration compatibility tests ran locally; no migration was added.
22. **Unit/action/query tests:** Final `pnpm test` passed **298 tests across 48 files**, including the same 50 PostgreSQL integration tests. New cases cover strict dates, leap days, empty values, length bounds, Spanish multiline notes, stock-only validation, action field forwarding, import note/header preservation and measured action/focus contrast in both themes.
23. **Desktop/mobile browser regression:** The full `pnpm test:e2e` run passed **73 tests**, with **15 existing intentional skips** and no failures (8.8 minutes). That run completed before the user's final darker-blue choice. The final palette was checked on both projects using Product Edit/Inventory Edit, the wizard, image/theme/search, catalog management, warranty/autocomplete and existing-product Quick Add suites. The subset produced **34 passed, 3 intentional skips, 1 local test-server stylesheet failure** (7.2 minutes). The trace recorded a failed CSS request on the mobile login page; no login code was changed. That single case then passed from a fresh test session (**1 passed**, 32.2 seconds), leaving **35 distinct revised-palette cases verified**. Skips in the full run are existing device-specific/stateful-flow exclusions and remote staging cases; no staging deployment or mutation was performed.
24. **Static validation/build:** Final `pnpm lint`, `pnpm typecheck`, `pnpm build` and `git diff --check` passed after the darker-blue change. Build retains the pre-existing middleware-to-proxy deprecation notice; it does not prevent the build.
25. **Changed files:** Listed below. No dependency manifest, lockfile, infrastructure configuration, image authorization/storage service or migration changes.
26. **Remaining limitations:** The referenced bar still needs its action/label identified. The preinstalled Next.js runtime is **16.3.8**, while `package.json` and `pnpm-lock.yaml` declare **16.3.6**. All reported checks used the preinstalled runtime; dependencies were not reinstalled or changed, so an exact frozen-lockfile install was not validated. Browser evidence uses Chromium plus fake R2/disposable PostgreSQL; production promotion and live-service validation remain for the user's separate review/release process.

## Changed files

```text
docs/product-edit-information-review.md
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
src/features/theme/action-contrast.test.ts
src/features/products/components/product-form.tsx
src/features/products/components/products-table.tsx
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

## Local evidence

Logs are ignored local artifacts under `.git/`: `product-edit-lint.log`, `product-edit-typecheck.log`, `product-edit-test.log`, `product-edit-integration.log`, `product-edit-build.log`, `product-edit-e2e-full.log`, `product-edit-e2e-palette.log`, `product-edit-e2e-retry.log`, and `product-edit-diff-check.log`. The archived final-palette browser report is `.git/product-edit-review/palette-report/index.html`; `playwright-report/index.html` contains the successful isolated rerun. Final-palette screenshots were preserved under `.git/product-edit-review/` before that rerun.

- [Tablet photo controls, Light](../.git/product-edit-review/product-edit-information-P-8467a-es-at-every-requested-width-desktop-chromium/photos-900-light.png)
- [Desktop photo controls, Dark](../.git/product-edit-review/product-edit-information-P-8467a-es-at-every-requested-width-desktop-chromium/photos-1440-dark.png)
- [Mobile photo preview, Dark](../.git/product-edit-review/product-edit-information-P-8467a-es-at-every-requested-width-mobile-chromium/preview-393-dark.png)
- [Mobile Step 5 additional information, Light](../.git/product-edit-review/quick-add-wizard-wizard-la-42c28-and-cancellation-at-393×727-mobile-chromium/light-additional-information.png)
- [Mobile inventory information, Dark](../.git/product-edit-review/product-edit-information-s-cb32f-product-or-historical-entry-mobile-chromium/inventory-information-dark.png)

Use the disposable test database and explicitly override database, site, authentication and R2 environment variables to the local harness before rerunning. The checked-in environment file's production values must not be used for writable validation. Integration tests reset their disposable fixtures, so run them before browser fixtures, not concurrently.
