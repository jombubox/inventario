# Theme, images and admin search review

Transport follow-up, October 3, 2026: the multipart upload limitation described in this earlier validation snapshot is addressed by the [direct R2 upload candidate](direct-image-upload-review.md). That report records the new transport, updated validation and required deployment configuration. This report retains the October 2 implementation evidence.

Implementation review for the current working tree, October 2, 2026. No deployment, production migration, production seed, production R2 operation, environment-variable change, DNS change or staging change was performed. Validation uses disposable PostgreSQL at `127.0.0.1:54330/jumbobox_test`, a local Neon WebSocket proxy and fake R2 at `127.0.0.1:5555`.

1. **Theme before:** CSS variables and Tailwind semantic colors already existed. Light background was `#FCFCFC`, primary/action `#2868DC`; dark background was navy `#000F30`, card `#141414`, primary cyan `#46C4FF`. Theme initialization ran before hydration and respected stored/system preferences.
2. **Light changes:** background `#F1F3F4`, cards `#FFFFFF`, primary/action `#2F73F2`. Fields use `#F8FAFB` to distinguish controls from cards.
3. **Dark changes:** background `#0D0F11`, cards `#191D23`, primary/action `#2F73F2`. Fields `#11151A`, muted surfaces `#252B33`, visible borders, readable muted text and blue selected surfaces. Modals dim the page using a separate black overlay rather than the dark-mode white text token.
4. **Design tokens:** existing centralized variables remain the source of colors. Added `field`, `link` and `overlay` tokens. Admin text links use contrast-adjusted blue, while primary buttons retain the exact requested blue. Button text `#050505` has approximately 4.71:1 contrast against `#2F73F2`; hover/active action colors remain readable. Shared public tokens change with the palette; public branding assets and layout remain intact. Theme toggle, storage and initialization logic are unchanged.
5. **Opened zoom:** extracted the existing public pointer zoom into `CursorZoom`, used by the main public gallery and shared opened `ImagePreview` in public/admin modals. No dependency was added.
6. **Desktop behavior:** fine mouse pointers magnify 2.25× around the pointer, clamp the origin, animate the transform and reset on exit. The image stays in a fixed clipped viewport, with no wheel listener or layout change. Instructions explain cursor zoom.
7. **Mobile behavior:** hover zoom is gated off for touch. Large images, thumbnail selection and previous/next controls remain available; tapping the image keeps the modal open. Native browser page zoom remains available; no custom pinch/swipe gesture was added.
8. **Upload root causes:** the old picker created object URLs during `useMemo` and revoked them in an effect cleanup. React development Strict Mode replayed cleanup without recreating the memoized URLs, leaving invalid previews, including when returning from placement. Selection also appended the same file repeatedly. A successful upload with a lost response left the local completion counter unchanged, so retry created another random object and image record. Five desktop before-fix tests failed, including independent Products and Inventory cases. The preview test was corrected to decode an image rather than use CSP-blocked blob `fetch()`, then rerun against the original picker; it still failed.
9. **Upload fix:** shared selection copies/reset file input values, validates MIME, extension, signature, nonzero size and the 10 MiB limit, rejects identical filename/content duplicates, creates/revokes previews together in an effect and reports each photo as selected/uploading/uploaded/failed. Quick Add keeps selection across its steps, blocks premature Enter submission and blocks closing/restarting while uploads are unresolved. Edit queues are keyed by product ID; uploaded alt text is displayed after refresh.
10. **Retry:** every selection retains a UUID. The server uses that UUID as the image ID/object-key token and a SHA-256 fingerprint in existing metadata. Replays return the existing record, including concurrent requests, and changed content for the same UUID is rejected. Product advisory locks cover storage writes and registration; orphan cleanup also locks/rechecks registrations. Confirmed files are skipped. Retry acts on photos, not product/inventory creation. Plain-text/HTML 413 responses use the existing safe response parser.
11. **Ordering:** creation provides accessible move-left/right controls; edit retains its move controls. Selected files upload sequentially in their chosen order. Existing images reorder through the existing API in a transaction with exact membership and duplicate-ID validation.
12. **Primary selection:** “Hacer foto principal” moves the chosen photo to the first position. Reordering, promoting, deleting and adding images preserve contiguous positions and exactly one primary when images exist. Removing the primary promotes the first remaining image.
13. **Schema migration required:** no. Existing image ID, `sortOrder`, `isPrimary`, JSON metadata and the unique primary index suffice.
14. **Source of truth:** saved display order defines primary position zero. The existing `isPrimary` field mirrors that position transactionally for compatibility with current readers/indexes. Legacy primary flags are respected when loading and normalized during image mutations; there is no mass data rewrite.
15. **Public gallery:** follows persisted primary-first order and opens the currently selected photo. DB and browser tests cover three photos, reorder, promotion, reload and matching public gallery order.
16. **Thumbnails:** Products and public catalog use the same saved primary as the gallery. Tests compare database-backed URLs and actual browser thumbnails after changes.
17. **Revalidation:** upload, reorder, promotion/alt edit and deletion call a shared image invalidation helper for the admin Products list, product edit page and existing public catalog/detail invalidation paths.
18. **Inventory root cause:** its input had no typing/debounce route handler; native GET submission emitted empty enum/boolean values which the schema rejected. Its SQL matched only inventory code, SKU and title, leaving relevant identifiers unsearchable.
19. **Inventory fix:** the existing GET filter form now navigates through a small shared client wrapper with a 250 ms typing debounce, immediate filter changes, URL synchronization, latest-request protection, pagination reset and a loading status. Server validation accepts blank optional filters. SQL includes the relevant domain fields; existing hierarchy data supports ancestor location/box matching without per-row queries.
20. **Products root cause:** reproduced separately. Its typing also had no route handler and its native form emitted blank status/stock/public values rejected by validation. SQL omitted piece type and normalized part/model matching.
21. **Products fix:** uses the same bounded form wrapper and safe optional-filter parsing. SQL remains in the existing list query; normalization and related identifiers are added through a shared predicate. Both lists show the requested Spanish empty states with clear/reset links.
22. **Search fields:** both match title, SKU, raw/normalized part number, brand, piece type, primary/secondary serial and raw/normalized compatible model. Inventory additionally matches inventory code, legacy bag/location identifiers and hierarchical location/box names/codes. Serial punctuation/internal spacing rules remain unchanged; outer whitespace is trimmed. Case is insensitive. `%`, `_` and backslash are escaped as literal search text.
23. **Performance:** Products uses two SQL statements; Inventory uses three, verified through a database logger. One-to-many serial/compatibility matches use correlated `EXISTS`, avoiding duplicate rows and N+1 queries. Filtering/counting/pagination remain in PostgreSQL. The location index is built once per request and reused for breadcrumbs/search. Deterministic ID tie-breakers support pagination. Existing substring `ILIKE` searches remain; no search index migration was introduced.
24. **Filters:** search, active filters, sort/direction and page size serialize together; blank parameters are omitted and search/filter changes reset page. Clear/whitespace restore the filtered list. Older responses cannot overwrite a newer typed query. Tests cover empty/partial/exact/case/trimmed searches, identifiers, no results, clear, filters, rapid changes and pagination on both projects.
25. **Accessibility:** search/filter inputs have names; loading/per-photo feedback uses status/alert roles. Photo controls name the operation/file. Existing native dialog Escape, focus restoration, close, thumbnail and previous/next controls remain. Viewer arrow-key navigation is covered; image taps do not close the dialog. Tests use normal interaction, without force-clicks.
26. **Unit result:** `pnpm test` passed: 165 tests across 36 files. The 35 integration tests skipped in this command were run separately against PostgreSQL.
27. **Integration result:** 35 tests passed across two files against disposable local PostgreSQL. Includes independent DB-backed Products/Inventory search matrices, bounded query counts, image ordering/primary consistency, rollback on invalid membership, idempotent retry and concurrent upload replay.
28. **Desktop E2E:** full suite: 24 passed, three existing remote/staging cases skipped. The focused regression suite was repeated after final accessibility text and screenshot-wait changes: all seven desktop cases passed.
29. **Mobile E2E:** full suite: 18 passed, nine existing remote/staging or duplicate desktop-only cases skipped. The final focused rerun passed all seven mobile cases. Combined full suite: 42 passed, 12 skipped, zero failures.
30. **Visual review:** passed, with 48 distinct screenshots inspected/captured across both themes. Matrix includes dashboard/sidebar, Quick Add photos, Products, Inventory, brands, piece types, locations and opened viewer at 1440×900, 900×900 and 393×727, light/dark. Tests verify computed token/surface/button/field colors, persistence/system preference and overflow as well as screenshots. Captures wait for page headings and decoded images. Screenshots keep the caret unchanged to avoid mutating unhydrated input attributes during capture.
31. **Lint:** `pnpm lint` passed, exit 0, no lint warnings.
32. **Typecheck:** `pnpm typecheck` passed, exit 0.
33. **Build:** `pnpm build` passed, exit 0. Existing middleware deprecation remains. The local fixture's Open Graph image fetch warned about the stopped `127.0.0.1:3000/logo.svg` server; this did not fail the build and does not validate production image fetching.
34. **Diff check:** `git diff --check` passed. Working-tree review found only the 46 implementation/test/report files listed below, with no secret or temporary files among them.
35. **Files changed:** manifest below. Changes are theme tokens/classes, existing image/search paths, focused shared helpers, tests and this report. Hosting configuration and production resources were not changed.
36. **Migrations:** none generated or applied by this implementation. Integration tests use the disposable database's already-applied schema and local fixtures.
37. **Limits:** this task does not prove production upload sizes. The application's 10 MiB limit passes locally, but the unchanged multipart function path is subject to Vercel's documented 4.5 MB payload limit. Server rejection is now understandable and retry-safe; bypassing the host limit requires a separately reviewed upload transport change. See [Vercel Function request-size limits](https://vercel.com/docs/functions/limitations#request-body-size). Touch checks use Chromium device emulation, not physical-device Safari. Existing substring search may need plan/index work if production data grows substantially. No custom pinch/swipe library or production smoke test was introduced.

## Evidence

Before-fix logs, corrected preview reproduction and final command logs are retained outside the working tree at `C:/Users/yo/Desktop/work/JumboBox-releases/local-theme-before/`. Playwright's ignored `test-results/` and `playwright-report/` hold traces, screenshots and reports.

- Before fix: `theme-before.log` and `preview-before-decode.log`.
- Final commands: `unit-final.log`, `integration-final.log`, `lint-final.log`, `types-final.log`, `build-final.log`.
- Full desktop/mobile run: `e2e-verified.log` (42 passed, 12 skipped).
- Final focused desktop/mobile rerun: `visual-verified.log` (14 passed).
- Durable screenshots: `visual-final/theme-images-search-theme--b5510-le-layout-match-the-palette-desktop-chromium/` and the equivalent `mobile-chromium/` directory. There are 32 desktop-size and 16 mobile-size original screenshots; Playwright attachment copies duplicate these files.

## Changed-file manifest

- `docs/theme-images-search-review.md`
- `src/app/admin/auditoria/page.tsx`
- `src/app/admin/inventario/page.tsx`
- `src/app/admin/movimientos/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/productos/[id]/page.tsx`
- `src/app/admin/productos/nuevo/page.tsx`
- `src/app/admin/productos/page.tsx`
- `src/app/api/products/images/[id]/route.ts`
- `src/app/api/products/images/reorder/route.ts`
- `src/app/api/products/images/upload/route.ts`
- `src/app/globals.css`
- `src/components/forms/admin-list-filters.tsx`
- `src/components/layout/admin-nav-link.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/modal.tsx`
- `src/components/ui/page-header.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/textarea.tsx`
- `src/features/admin/server/admin-services.integration.test.ts`
- `src/features/catalog/components/product-gallery.tsx`
- `src/features/images/components/cursor-zoom.tsx`
- `src/features/images/components/image-preview.tsx`
- `src/features/images/components/photo-selection.tsx`
- `src/features/images/components/product-image-manager.tsx`
- `src/features/images/components/use-photo-uploads.ts`
- `src/features/images/domain/image-policy.ts`
- `src/features/images/server/image-service.ts`
- `src/features/images/server/revalidation.ts`
- `src/features/imports/components/import-wizard.tsx`
- `src/features/inventory/components/quick-add-inventory.tsx`
- `src/features/inventory/data/admin-inventory-queries.ts`
- `src/features/locations/domain/location-hierarchy.ts`
- `src/features/products/components/catalog-management.tsx`
- `src/features/products/components/compatible-models-field.tsx`
- `src/features/products/components/product-form.tsx`
- `src/features/products/components/products-table.tsx`
- `src/features/products/data/admin-product-queries.ts`
- `src/features/products/data/product-search.ts`
- `src/validators/admin-query.test.ts`
- `src/validators/admin-query.ts`
- `src/validators/image.ts`
- `tests/e2e/admin-security.spec.ts`
- `tests/e2e/publication-ux.spec.ts`
- `tests/e2e/quick-add-inventory.spec.ts`
- `tests/e2e/theme-images-search.spec.ts`
