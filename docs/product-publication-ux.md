# Product publication UX implementation report

Review date: October 2, 2026. Changes are local and uncommitted. No deployment or production mutation was performed.

1. **Publication/status rules found.** Products store `DRAFT`, `ACTIVE`, or `ARCHIVED`, an independent `isPublic` flag, and `deletedAt`. The public catalog requires `ACTIVE`, `isPublic = true`, and no deletion. The existing product service clears visibility for non-active statuses. Before this iteration, Quick Add created draft/private products with no price and MXN currency. Product edit already controls price, currency, status, visibility, identity, serials, and compatibility; photos have their existing image manager.

2. **Quick Add price.** “Precio de venta” uses the same shared validator and existing `salePrice numeric(12,2)` field as Product edit. Money stays a decimal string through validation and persistence. Negative numbers, commas, malformed values, exponent notation, NaN/Infinity, more than ten integer digits, and more than two decimal places are rejected. Zero remains valid; blank remains null. Spanish help explains the accepted format before continuing.

3. **Currency.** Quick Add shows a plain MXN suffix and its server action persists MXN, including when a caller supplies another currency. The existing three-letter currency schema remains available to the wider domain. No single-option dropdown was added.

4. **Status default.** New Quick Add products default to the existing `ACTIVE` value, shown as “Activo.” The user can select Borrador or Archivado. Generic database defaults remain unchanged.

5. **Visibility default.** “Visible en el catálogo público” starts checked. An explicit unchecked choice persists as private. For non-active statuses, the form explains that the product will be saved without public visibility and the existing service enforces that rule.

6. **Catalog impact.** Catalog requirements were preserved. Price, photos, and positive stock are not publication prerequisites in this domain: null prices show “Consultar precio,” and no available stock shows the existing exhausted state. Required identity/catalog inputs and inventory placement continue through existing validation and transactional services.

7. **Ver publicación.** Success shows the public link only when the persisted product actually meets the public predicate. It opens a new tab with `noopener noreferrer`. Private products show a clear non-visible explanation and no public link. Product edit and the table’s Details modal also expose this action for eligible products.

8. **Canonical URL.** `publicProductPath` and `productPublicationPath` centralize `/catalogo/[slug]` construction and eligibility. Links, canonical metadata, structured data, sitemap, and revalidation use the helper. The current persisted slug is used; the existing slug-generation/collision strategy and immutable-on-edit behavior remain. No duplicated URL field was introduced.

9. **Cache/revalidation.** Existing public invalidation covers the home page, catalog, current product detail, and sitemap. Quick Add retains admin and public invalidation. Successful image uploads now also invalidate the admin product list and exact edit page. Public pages retain their existing dynamic rendering behavior. Location saves invalidate admin/location/inventory views and return freshly loaded options.

10. **Desktop zoom.** The existing public gallery magnifies the main image to 2.25× on fine-pointer mouse movement. A bounded transform origin follows the pointer; leaving resets scale. Direct DOM updates avoid a React render for every pointer event. The square clipped container preserves layout, images retain their aspect ratio, and reduced-motion preferences disable the transition. There is no wheel handler or added zoom dependency.

11. **Mobile images.** Tapping the main image opens a larger, viewport-fitting gallery. Touch movement does not trigger hover zoom or intercept scrolling. Buttons and keyboard users can open the same viewer. This adds a larger view, not a custom pinch gesture system.

12. **Table thumbnail.** The first image follows primary-image, sort-order, then creation-time ordering. The table requests a 48px optimized thumbnail. Missing or failed images use a clean placeholder.

13. **Image preview.** The thumbnail opens a shared dialog with all images, primary image first, previous/next controls, selected thumbnails, an image count, left/right keyboard navigation, Escape, and a labeled close button. Failed images also have a placeholder. Gallery metadata is requested only after opening the modal.

14. **Updated column removed.** “Actualizado” was removed from the main Products table. The domain field and the existing update-date sorting capability remain.

15. **Price column.** The new “Precio” column uses the existing money formatter and displays currency. Null prices show an em dash. Database decimal strings are never displayed raw.

16. **SKU cleanup.** Desktop SKU cells contain only the SKU. The product title has its own cell. On narrow screens SKU is available in Details instead of forcing an extra column.

17. **Models column.** Desktop “Modelos” shows “Ver compatibilidad (N).” Narrow screens retain the same action beneath the product name. Model lists are not expanded inside table cells.

18. **Compatibility modal.** All registered models are shown, grouped by their stored brand and ordered by brand/model. The empty state reads “Este producto no tiene modelos compatibles registrados.” Long content scrolls inside the shared dialog. Loading failures offer Reintentar.

19. **Details modal.** “Detalles” sits alongside Editar and shows creation/update times, status, effective public visibility, SKU, brand/type, part number, and stock. Dates use the existing Spanish formatter and America/Mexico_City timezone. Internal product IDs are not displayed.

20. **updatedAt location.** “Última actualización” is now in the table’s Details dialog. The edit form’s concurrency mechanism and stored timestamp remain intact.

21. **Inline location creation.** “+ Agregar ubicación” expands a compact code/name editor within Quick Add. The existing service creates an active, root `WAREHOUSE`, then options refresh and the new location is selected. Product fields, photos, compatibility, and quantity remain in component state.

22. **Inline location editing.** “Editar ubicación” expands a name-only editor for the selected active physical container. Save refreshes options while preserving the selected location and box/form state. A stale edit returns a Spanish concurrency message and fresh timestamps/options without discarding the typed product data.

23. **Hierarchy safety.** Rename reuses the existing location update transaction and optimistic `expectedUpdatedAt` check, with a row lock. Code, type, parent, activity, notes, child boxes, and inventory relationships are preserved. BOX/BAG and inactive selections cannot be renamed through this path. Existing active physical-location selection, explicit legacy-root-box grouping, and submit-time server validation remain. No inline delete or reparent action exists.

24. **Success state.** The flow distinguishes product creation from adding inventory to an existing product. It shows the saved quantity and destination, actual public visibility, optional-photo state, and Ver publicación / Agregar otro producto / Cerrar. The final new-product submit button reads “Guardar producto.”

25. **Upload timing.** Product, new box, and inventory commit in the existing transaction; optional photos upload afterward. The success screen shows preparation, per-photo progress, completion, or failure accurately. The public link is available once the product exists while unfinished photos remain clearly labeled. A failure retains the saved product/inventory and offers retry from the first pending photo. Closing/restarting is disabled during an active upload.

26. **Public prices.** Public listing/detail now use the same existing money formatter as admin. The MXN decimal value saved through Quick Add is visible on the immediately opened product page. Null-price wording remains “Consultar precio.”

27. **Status/visibility matrix.** Integration tests create all six combinations below, check persisted fields through Product edit data, and verify public detail availability. Unit coverage additionally checks deleted products.

   | Requested status | Requested visibility | Persisted visibility | Public |
   | --- | --- | --- | --- |
   | ACTIVE | true | true | Yes |
   | ACTIVE | false | false | No |
   | DRAFT | true | false | No |
   | DRAFT | false | false | No |
   | ARCHIVED | true | false | No |
   | ARCHIVED | false | false | No |

28. **Queries/performance.** Product list rows include price, currency, slug, dates, one primary-image key, and compatibility count in the existing bounded list query. The list remains two SQL calls total (rows and pagination count), verified against six products. Per-row image/count data uses indexed subqueries rather than application-level queries. The authenticated, private/no-store review endpoint makes three bounded calls for one opened product: existence, images, and compatibility. Full galleries are not rendered/downloaded for every row. Details uses already loaded list data.

29. **Accessibility.** Shared native dialogs provide modal focus handling, Escape, labeled close controls, scroll containment, and restored trigger focus. Image controls, publication, compatibility, details, and location actions have descriptive Spanish names. Gallery navigation also supports arrows. Mobile keeps product/image/price/status/actions visible in card rows; other fields are reachable through Details.

30. **Unit tests.** `pnpm test`: 162 passed, 31 skipped; 35 test files passed and two PostgreSQL suites skipped in the unit run. New coverage includes decimal validation, defaults, explicit private selection, server-side MXN behavior, public URL eligibility/encoding, and authenticated review-route responses. The skipped PostgreSQL tests were run separately below.

31. **Integration tests.** `pnpm test:integration`: 31 passed across two files on disposable local PostgreSQL. Added coverage verifies the six publication combinations, decimal persistence, Product edit values, bounded query counts, physical-location rename preserving hierarchy/stock, stale edits, and invalid BOX edits. A pre-existing movement test was made deterministic by explicitly ordering chronological assertions by `createdAt` instead of relying on unspecified database row order.

32. **Desktop E2E.** Chromium desktop: 17 passed, three skipped staging-smoke tests. The publication flow covers price/defaults, invalid-price feedback, two models/photos, inline location create/rename, preserved form state, stock persistence, pending uploads, canonical public popup, correct data, zoom behavior, and all table dialogs. Private/null-price/no-image/no-model and failed-upload/retry paths are also covered. Existing security, import, catalog, stock, Quick Add, and lifecycle tests pass.

33. **Mobile E2E.** Chromium mobile: 11 passed, nine skipped. Both new publication and private/upload-retry flows pass at 393×727, including larger image viewing, modal focus restoration, responsive table actions, and Edit values. Skips are the existing desktop-only scenarios, the desktop-only 900px review, and staging tests. Full suite total: 28 passed, 12 skipped.

34. **Visual review.** Screenshots were captured at 1440×900, 900×900, and 393×727 for publication fields, status/visibility, inline location creation/editing, success, Products table, image/compatibility/Details dialogs, and the public gallery. Desktop pointer zoom has its own screenshot and behavior assertions. Screenshot checkpoints wait for visible images and assert no horizontal page overflow. The table wraps its filters and switches to mobile cards; modal content scrolls within the viewport. A dashboard grid sizing fix prevents background mobile overflow after inserting inventory. Evidence is attached to the local Playwright HTML report in `playwright-report/index.html` and retained in `test-results/`.

35. **Lint.** `pnpm lint` passed.

36. **Type checking.** `pnpm typecheck` passed.

37. **Build.** `pnpm build` passed with Next.js 16.3.6. Warnings: the existing middleware convention is deprecated, and the Open Graph renderer could not fetch the local logo while the local HTTP server was stopped. Neither prevented compilation, TypeScript checking, or static generation. Explicit disposable configuration was used; the production private-address image protection remains enabled.

38. **Diff check.** `git diff --check` passed.

39. **Files changed.** The complete file inventory is below. Changes extend existing features, shared validators, queries, actions, and components; no application rebuild or architecture replacement was performed.

40. **Migrations.** No schema change or new migration is needed. Existing migrations were applied only to a newly created disposable local PostgreSQL database. No production migration or seed ran.

41. **Remaining limitations.** Browser validation covers Chromium desktop and mobile emulation; Safari/Firefox and real-device pinch behavior were not exercised. Optional photos can still be uploading when an already-public product is opened; the progress/failure state explicitly describes this existing lifecycle. The gallery supplies a larger mobile view without introducing custom pinch gestures. Existing middleware/logo warnings remain. Production deployment, Neon production, production R2, Vercel, Cloudflare staging, hosting, and DNS were untouched. The development-only loopback-image exception requires an explicit local-test flag and the exact fake-R2 origin; it is disabled in production builds.

## File inventory

Configuration and page integration:

- `next.config.ts`
- `playwright.config.ts`
- `src/app/(public)/catalogo/[slug]/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/productos/page.tsx`
- `src/app/admin/productos/[id]/page.tsx`
- `src/app/globals.css`
- `src/app/sitemap.ts`

Shared dialogs, images, public gallery, and publication helpers:

- `src/components/ui/modal.tsx` (new)
- `src/features/images/components/image-preview.tsx` (new)
- `src/features/catalog/components/product-gallery.tsx`
- `src/features/catalog/components/product-card.tsx`
- `src/features/catalog/domain/catalog.ts`
- `src/features/catalog/server/revalidation.ts`
- `src/features/products/domain/public-product.ts` (new)
- `src/features/products/domain/public-product.test.ts` (new)

Quick Add and locations:

- `src/features/inventory/components/quick-add-inventory.tsx`
- `src/features/inventory/data/quick-add-queries.ts`
- `src/features/inventory/server/actions.ts`
- `src/features/inventory/server/actions.test.ts` (new)
- `src/features/inventory/server/quick-add-service.ts`
- `src/features/locations/components/quick-add-location-editor.tsx` (new)
- `src/features/locations/server/actions.ts`
- `src/features/locations/server/location-service.ts`
- `src/validators/admin-location.ts`
- `src/validators/admin-product.ts`
- `src/validators/quick-add-inventory.ts`
- `src/validators/quick-add-inventory.test.ts`
- `src/validators/shared.ts`

Products table, data, services, and image invalidation:

- `src/features/products/components/products-table.tsx` (new)
- `src/features/products/data/admin-product-queries.ts`
- `src/features/products/server/product-service.ts`
- `src/app/api/admin/products/[id]/review/route.ts` (new)
- `src/app/api/admin/products/[id]/review/route.test.ts` (new)
- `src/app/api/products/images/upload/route.ts`
- `src/app/api/products/images/upload/route.test.ts`

Integration and browser validation:

- `src/features/admin/server/admin-services.integration.test.ts`
- `tests/e2e/helpers/test-image.ts` (new)
- `tests/e2e/publication-ux.spec.ts` (new)
- `tests/e2e/public-catalog.spec.ts`
- `tests/e2e/quick-add-inventory.spec.ts`
- `tests/e2e/staging-smoke.spec.ts` (button wording only; staging tests were not run)
- `docs/product-publication-ux.md` (this report)
