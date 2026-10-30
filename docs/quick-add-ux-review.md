# Quick Add UX review candidate

Local candidate for October 9, 2026, based on the current Jombubox release. Production deployment, production data, production migrations, R2 objects/configuration, Vercel environment variables, Cloudflare Workers and DNS were not changed. Validation uses disposable PostgreSQL at `127.0.0.1:54330/jumbobox_test`, the existing local Neon WebSocket proxy, and fake R2 at `127.0.0.1:5555`. No new migration is needed.

1. **Previous condition default:** `NEW` (Nuevo) in Quick Add, standalone creation and creation validators. Internal service callers could leave it unclassified.
2. **New condition default:** `USED` (Usado) in initial/remounted wizard state, standalone creation, validators, Quick Add service and product creation service. Explicit Nuevo remains valid. Edit preserves saved values, including null; imports can explicitly retain null. Existing stored records are not backfilled.
3. **Warranty UI:** The inspected candidate had optional free text with “Ej. 30 días; sin garantía”. Quick Add step 5 and Product Edit now share a text input labelled Garantía, an external meses suffix, numeric mobile keyboard and Sin garantía checkbox. There are no number spinners or preset choices. Invalid text, units, negatives, zero and fractions receive Spanish validation errors.
4. **Persistence:** Reuses nullable `products.warranty` text: `6 meses`, `12 meses`, `Sin garantía`, or null when unspecified. Structured form data is validated and converted on the server by the shared schema. Decimal arithmetic is not used. The only bound is the existing 240-character column check: at most 234 duration digits plus the six-character suffix. No arbitrary business duration limit was introduced.
5. **Sin garantía:** Disables the input and submits an empty active duration with the explicit flag; the schema stores `Sin garantía`. The typed draft remains in client state for unchecking. Empty unchecked input stores null. Validation ignores inactive draft months.
6. **Historical warranty compatibility:** Recognizes canonical months and explicit `Sin garantía`. Other historical text appears as “Garantía registrada” with Cambiar garantía. Untouched historical values are omitted from edit submissions, preserving their exact stored text. Explicit replacement uses the new months control; there is no inferred conversion from days or years. Existing public detail rendering continues to show saved text.
7. **Brand search:** Filters the existing prefetched active catalog with the existing comparable-text normalization. Empty queries show useful suggestions; typed results are limited to 20. Selection, clearing, keyboard and touch use the shared autocomplete.
8. **Piece Type search:** Uses the same component and behavior for Tipo de pieza, with its own selected ID and inline action. Both remain in step 1.
9. **Shared autocomplete:** `AutocompleteInput` supplies the listbox, active option, arrows, Enter selection, Escape dismissal, Tab handling, loading indicator and click/touch interaction for brands, piece types and compatible models. Models keep their existing debounced authenticated API, brand context, selection chips and inline service. Aborted searches cannot publish stale results. Suggestions close after an outside click completes, so shrinking a centered dialog cannot swallow Back/Next between pointerdown and pointerup.
10. **Duplicate prevention:** Client suggestions deduplicate normalized catalog names. Existing server catalog services retain normalized unique constraints, alias resolution and transaction advisory locks. Concurrent case/whitespace variants return the same record with one creation; a concurrent winner is selected successfully.
11. **Inline creation:** Existing authenticated catalog actions receive the normalized query, reuse or create through existing services, and return the selected record. The parent adds it once to its catalog options and preserves identification, models, photos, warranty and inventory state. No navigation away from the wizard occurs. Existing five steps and existing-product stock entry remain intact.
12. **Image root cause:** Search cards and the large viewer both used optimized `PreviewPhoto`. The viewer's approximately 700-pixel `sizes` caused Next/Image to select a resized rendition at its default optimization quality. CursorZoom then enlarged that rendition by 2.25. Direct upload sends the original File bytes to R2; it does not resize or recompress them.
13. **Original URL:** Existing authenticated review data derives the URL from `product_images.storage_key` through `getR2PublicUrl` and the existing `R2_PUBLIC_URL`. No thumbnail URL is used as the original source.
14. **Thumbnail/full resolution:** Table thumbnails stay optimized at 48px, gallery thumbnails at 120px, and the detail preview remains optimized. Only the selected large-view image uses Next/Image `unoptimized`, requesting the existing R2 object directly when the viewer mounts. Other originals wait until selected. The shared public large viewer receives the same improvement.
15. **Zoom:** Existing CursorZoom remains unchanged: fine mouse pointer follows the cursor at 2.25 scale and resets on leaving; coarse/touch input stays at normal scale. The transformed image is the original. The fixed viewer region and object-contain preserve aspect ratio without stretching.
16. **Image performance:** No eager original download in product results. One original is requested on opening; switching requests the newly selected original. Loading feedback is visible; unavailable sources show a Spanish error and placeholder, with close/reopen retry. Gallery position has its own accessible status label, distinct from loading feedback.
17. **R2 confirmation:** Upload authorization, signing, direct PUT, confirmation, retry, image ordering, primary promotion and storage services are unchanged. No production R2 upload, overwrite, deletion, move, credentials, permissions, CORS, lifecycle or CDN change occurred. Mutating image tests use fake R2 only.
18. **Inventory action placement:** Buscar en inventario appears with the product title and live availability at the top of the Products search row's photo or detail modal. It is separate from Agregar al inventario and remains easy to reach on narrow screens.
19. **Exact match:** Links to `/admin/inventario?productId=<UUID>`. The server query schema validates the UUID and applies parameterized equality on `inventory_items.product_id`, together with existing filters and the deleted-product exclusion. Invalid parameters produce a clear Spanish state before querying inventory.
20. **Availability:** The existing private review endpoint calculates `SUM(quantity)` for the selected product's `AVAILABLE` rows. Reserved, damaged, sold and scrapped quantities are excluded from available stock. No persisted availability field or public inventory API was added. Physical stock details and row statuses retain their existing semantics.
21. **Zero stock:** A valid existing product with no registered inventory shows “Este producto no tiene existencias registradas.” and Volver a productos. Additional filters yielding no matches use the normal empty-search message. Opening or navigating never creates stock; the existing authorized add-stock workflow remains available.
22. **Security:** Inventory page and review endpoint retain their existing admin checks. The existing review route validates IDs, returns private data with no-store headers and denies unauthenticated access. Public catalog exposure rules and public DTOs remain unchanged; private inventory locations/quantities are not newly exposed publicly.
23. **URL/filter persistence:** Incoming productId survives direct navigation, refresh, pagination and other filter changes via a hidden field in the existing filter form. Producto: [title] and Quitar filtro make it visible; removing it resets page and retains other filters. Initial URL synchronization skips overwriting server-rendered controls during hydration, preserving the first selection after refresh.
24. **PostgreSQL performance:** Reuses existing product and product/status indexes. Inventory rows remain SQL-filtered and paged at 20/50/100, with the same count predicate and no image join. Filtered inventory uses four queries including the existing location hierarchy and one product-title read; normal browsing stays at three. Review uses four queries for one product, with one indexed aggregate and no query per search row. Integration tests cover two images without duplicated stock rows, 22 exact rows across two pages, multiple boxes, optional bag, totals, filters and zero rows.
25. **Mobile review:** Pixel/Chromium checks passed autocomplete, warranty, condition, original viewer, touch behavior, inventory navigation and overflow checks. The new UX cases exercise 393×727, 900×900 and 1440×900 in both projects; 393×727 screenshots were visually inspected.
26. **Desktop review:** Chromium checks at 1440×900 and 900×900 passed all requested surfaces, original natural width 2400, mouse zoom/reset and overflow checks. Screenshots of autocomplete, warranty, the viewer and filtered inventory were visually inspected; the existing theme suite covers light/dark persistence.
27. **Unit tests:** `pnpm test` passed 276 tests across 46 files, including 227 unit/action/query tests and 49 PostgreSQL integration tests (exit 0, 45.39s). Covers warranty durations 3/6/12/24, invalid entries, schema bounds, leading-zero normalization, unspecified versus explicit no warranty, draft toggling, legacy parsing, structured action validation and condition defaults.
28. **Integration tests:** The explicit `pnpm test:integration` run passed all 49 tests across four files (exit 0, 25.26s), also included in the full test run. Disposable PostgreSQL covers new warranty/condition save/edit/public reads, untouched legacy text/null condition, concurrent normalized catalog creation, exact product filtering, pagination, location/bag preservation, nonavailable stock exclusion and bounded query counts. Existing migration compatibility tests ran locally; no migration was added or applied to production.
29. **E2E:** `pnpm test:e2e` passed: 69 tests, 15 intentional skips, zero failures (exit 0, 8.2m), across desktop-chromium and mobile-chromium. Skips are existing device-specific/stateful-flow exclusions and remote staging-only tests; staging was not deployed or mutated. Both new UX cases passed in both projects. They assert optimized search source, no initial originals, selected-original requests, close/reopen, missing-source error, auth protection, exact inventory rows/filter/refresh/clear and all three requested widths. Existing upload/retry/primary/order, serial/model, five-step/reset, stale-entity, publication and security suites also passed.
30. **Lint:** `pnpm lint` passed (exit 0).
31. **Typecheck:** `pnpm typecheck` passed (exit 0).
32. **Build:** `pnpm build` passed (exit 0) on installed Next.js 16.3.6: optimized compilation, TypeScript, all eight static pages and route generation completed. Uses explicit local database/storage/auth overrides. Existing middleware deprecation and the Open Graph generator's failed localhost logo fetch are nonfatal notices; the local development server was stopped before the build.
33. **Whitespace check:** `git diff --check` passed (exit 0). Git's LF-to-CRLF working-copy notices are not whitespace errors.
34. **Changed files:** 36 files: 21 application files, 14 test/helper files and this report. Full list below.
35. **Migration:** None. Existing condition/warranty columns and historical migrations are unchanged; the condition migration regression test's expected new-product default was updated to Usado.
36. **Limitations:** Original detail cannot exceed the uploaded source's actual resolution. Missing originals show an error/placeholder; no replacement is fabricated. Historical warranty text requires explicit replacement to enter the months editor. Brand/type searches reuse the current prefetched active catalogs; the component displays at most 20 suggestions. Browser validation uses local Chromium and emulated mobile, not physical-device pinch gesture testing. Existing middleware/LCP/local logo notices are outside this focused change. The candidate remains local and undeployed for review.

## Changed files

```text
docs/quick-add-ux-review.md
src/app/admin/inventario/page.tsx
src/components/forms/admin-list-filters.tsx
src/components/forms/autocomplete-input.tsx
src/db/product-condition-migration.integration.test.ts
src/features/admin/server/admin-services.integration.test.ts
src/features/images/components/image-preview.tsx
src/features/inventory/components/quick-add-inventory.tsx
src/features/inventory/data/admin-inventory-queries.ts
src/features/inventory/server/actions.test.ts
src/features/inventory/server/actions.ts
src/features/inventory/server/quick-add-service.ts
src/features/products/components/catalog-autocomplete.tsx
src/features/products/components/compatible-models-field.tsx
src/features/products/components/product-form.tsx
src/features/products/components/products-table.tsx
src/features/products/components/warranty-field.tsx
src/features/products/data/admin-product-queries.ts
src/features/products/domain/warranty.ts
src/features/products/server/actions.ts
src/features/products/server/product-service.ts
src/validators/admin-product.test.ts
src/validators/admin-product.ts
src/validators/admin-query.test.ts
src/validators/admin-query.ts
src/validators/product.ts
src/validators/warranty.test.ts
src/validators/warranty.ts
tests/e2e/helpers/quick-add-wizard.ts
tests/e2e/helpers/test-image.ts
tests/e2e/inventory-condition-hero.spec.ts
tests/e2e/publication-ux.spec.ts
tests/e2e/quick-add-inventory.spec.ts
tests/e2e/quick-add-ux.spec.ts
tests/e2e/quick-add-wizard.spec.ts
tests/e2e/theme-images-search.spec.ts
```

## Local review evidence

- Test logs: `.git/ux-test-final.log`, `.git/ux-integration-final.log`, `.git/ux-e2e-final.log` and `.git/ux-build-final.log`.
- Playwright HTML report: `playwright-report/index.html`.
- [Mobile warranty and Usado default](../test-results/quick-add-ux-autocomplete--ba561-ve-navigation-at-all-widths-mobile-chromium/warranty-393.png).
- [Mobile original viewer and inventory action](../test-results/quick-add-ux-product-previ-8b694-nation-reset-and-zero-stock-mobile-chromium/original-393.png).
- [Desktop autocomplete](../test-results/quick-add-ux-autocomplete--ba561-ve-navigation-at-all-widths-desktop-chromium/autocomplete-1440.png).
- [900px filtered inventory](../test-results/quick-add-ux-product-previ-8b694-nation-reset-and-zero-stock-desktop-chromium/inventory-900.png).

Logs and screenshots are local generated artifacts, not release files. Before repeating commands, explicitly override database, auth, site URL and storage variables for disposable local resources; the local env file's production defaults must not be used for mutating tests. The validation commands were `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build` and `git diff --check`. The test runner's local-only database guards were kept in place.
