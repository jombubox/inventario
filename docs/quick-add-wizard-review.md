# Quick Add: five-step wizard review

Review candidate for October 6, 2026. No deployment, production migration, production seed, production database mutation, production R2 operation or DNS change was performed. Validation uses disposable local PostgreSQL `127.0.0.1:54330/jumbobox_test`, the existing local Neon WebSocket proxy and fake R2 at `127.0.0.1:5555`.

1. **Previous structure:** Quick Add had search, one long new-product details screen, then inventory placement. Existing products skipped product details.
2. **New architecture:** The same dialog, React state, Server Action and services now present five conditional screens for new products. Search and existing-product placement remain separate. No second creation service or transaction architecture was added.
3. **Existing products:** Search → select → location, box, optional bag, quantity → inventory entry. Product master fields are absent from both the UI and existing-product payload. The discriminated server validator strips abandoned new-product data.
4. **Step 1:** Search/select brand and piece type, with existing inline catalog creation. Empty selections receive field-specific Spanish errors immediately.
5. **Step 2:** Optional name, part number, optional primary serial and dynamic secondary serials. Automatic naming remains in the product service. Existing serial normalization, length limits and duplicate detection remain authoritative.
6. **Step 3:** Existing searchable compatible-model multi-select, removal and safe inline creation. Models may be empty when a part number exists. The current domain needs either a part number or a compatible model; the wizard checks that alternative after this step, allowing model-only products.
7. **Step 4:** Existing photo picker, previews, removal, primary promotion and reordering. A keyboard-accessible “+ Agregar fotos” button opens the same file input without exposing browser-localized English controls. Photos are optional. JPEG/PNG/WebP signatures, the 10 MiB limit and the existing ten-image maximum are unchanged.
8. **Step 5:** Inventory (location, box, bag, positive integer quantity); Venta (optional sale price, fixed MXN, optional warranty, derived availability); Publicación (Activo/Borrador/Archivado, Nuevo/Usado and public visibility). A compact summary stays in this step.
9. **Disponibilidad:** Reuses `getPublicAvailability` and the inventory domain. New stock is `AVAILABLE`; available unit count determines Disponible/Pocas piezas/Agotado. Product status controls lifecycle and visibility controls catalog inclusion; neither is another stock-availability field.
10. **Warranty audit:** No warranty field existed in products, schema, imports, edit or catalog. Description was not repurposed.
11. **Warranty implementation:** Optional normalized text, at most 240 characters, persisted as `products.warranty`. A blank value means unspecified; users can explicitly write “Sin garantía” or a duration/term. No warranty claim workflow or editable redundant field was introduced. Product Edit can view/change it, public details show it when supplied, and audit snapshots include it. Imports retain their existing contract; omitted warranty does not overwrite a previously supplied value during a product update.
12. **Migration:** Generated additive `0008_product_warranty.sql` adds one nullable column and a length constraint, plus its Drizzle snapshot/journal entry. Earlier SQL migrations were not edited. Applied only to disposable local databases. Production promotion must apply this migration before running the updated application.
13. **Validation:** Wizard schemas reuse the final Quick Add field definitions. Step 1 requires valid selections; step 2 checks optional text/serial data; step 3 requires the part-or-model alternative; step 4 permits zero photos; step 5 checks inventory, decimal price, warranty and publication values. All steps and the full discriminated schema are checked again before dispatch. Server/service validation and stale catalog/location/box checks remain final authority. Errors route to the relevant step.
14. **State preservation:** Parent dialog state owns all product, model, photo and placement values; only the active step's main controls mount. Photo files retain order and primary position while previews recreate their object URLs safely. Secondary serial rows now use unique IDs across component remounts.
15. **Back/Next:** Both are explicit `type="button"`. Next validates the current step before advancing; Back never submits. Spanish footer actions are Cancelar/Siguiente, Atrás/Siguiente and Atrás/Agregar producto. Restart remounts a clean new-product wizard at step 1, including empty catalog/location selections and reset defaults.
16. **Enter:** Enter in an input cannot implicitly submit the form at any step. Compatible-model search handles its own keyboard selection. The final submit remains guarded by current mode, step 5, validation and busy state.
17. **Inline brand:** Existing validated catalog action, normalized reuse, automatic selection and preservation of parent state. Navigation/closing is blocked while its action runs.
18. **Inline piece type:** Same existing catalog behavior and busy protection as brand creation.
19. **Inline compatible model:** Existing action/search architecture, automatic selection, preserved prior models and product data. No product record is created by advancing steps.
20. **Inline locations/boxes:** Existing location editor/services, fresh active options and the unparented-box grouping are retained. A newly created location is selected without clearing product/commercial data. Box creation stays inside final transaction, so navigation/canceling does not leave an empty box.
21. **Photos:** No upload authorization, PUT or registration happens on step navigation. The unchanged upload hook runs only after successful product/inventory commit. Failure reports that product/stock saved and offers retries; batch order and selected primary are retained.
22. **Final transaction:** The existing Quick Add action calls the same transaction service. Product + optional box + stock + audit/movement records commit together or roll back together. Photos then use the existing signed authorization/direct PUT/confirmation sequence.
23. **Success:** Persistent success feedback includes quantity, placement/bag, visibility and photo states, plus Ver publicación when public, Agregar otro producto and Cerrar. Busy uploads prevent close/restart. Restart clears the previous product's data.
24. **Desktop review:** All five steps reviewed in light/dark at 1440×900. Early steps use content-sized height; longer photo/final content scrolls independently. Progress, title and navigation remain visible. Three-photo primary/order controls were also visually reviewed.
25. **Tablet review:** All five steps reviewed in light/dark at 900×900. Dialog stays within 92dvh, with a readable header, fixed footer and scrolling body. Automated checks verify no horizontal overflow and visible heading/primary action.
26. **Mobile review:** All five steps reviewed in light/dark at 393×727. The existing `svh` full-screen layout and independently scrolling content/fixed flex footer remain. Three-photo grid fits the width. At a reduced 393×450 viewport with price focused, the header and final action remain visible. The dialog also listens to VisualViewport resize/scroll and follows its visible height/top on mobile, retaining `svh` as fallback. A separate check keeps layout height 727 but simulates visual height 450/top offset 70; the final action remains inside that visible region. Both keyboard checks pass, but neither replaces physical-device testing.
27. **Accessibility:** Native modal dialog plus explicit Tab/Shift+Tab wrapping; stable accessible dialog name; focusable/current step heading; numeric and spoken progress; field labels and invalid states; first invalid field or alert focus; Next/Back focus and scroll reset; Escape handling and trigger focus restoration. Browser checks caught and verified fixes for alert-before-field focus and Tab reaching the document body. An empty wizard closes immediately; meaningful edits offer Seguir editando/Descartar y cerrar inside the focus trap.
28. **Unit tests:** Final `pnpm test` passed 248 tests across 45 files, including six new wizard-validator/error-routing tests. Tests respect the existing 160-character serial limit and punctuation-preserving normalization.
29. **PostgreSQL integration:** The same successful test run includes all four PostgreSQL integration suites. New coverage verifies the complete five-step product/stock/serial/model/warranty payload, three ordered direct-image confirmations, warranty edits and catalog reads, additive migration preservation/constraints/idempotence. Existing rollback, concurrency, active locations, search, image and inventory invariance checks pass.
30. **E2E desktop:** Full local suite: 36 passed, 4 intentionally skipped, no failures. Existing Quick Add/publication/image/theme/condition regressions navigate the actual wizard buttons. Includes products/inventory search, inventory editing and box/bag display, direct uploads/retries, primary/order/zoom, catalog and theme checks.
31. **E2E mobile:** Full local suite: 29 passed, 11 intentionally skipped, no failures. Includes wizard navigation/state, inline creation, no premature mutations, final persistence, restart, stale selections, photo ordering, focus/cancellation and responsive layouts. Across both projects: **65 passed, 15 skipped**. Skips comprise six remote-staging cases (external infrastructure was excluded), five duplicate/device-specific viewport cases and four desktop-only admin scenarios. After the final visual-viewport change, both projects' Quick Add/wizard/regression suites passed again: **15 passed, 3 device-specific skips**. This follow-up verifies warranty in Product Edit and public details before/after editing, the Spanish photo button and visual-viewport keyboard bounds, alongside existing-stock and new-product behavior.
32. **Lint:** Final `pnpm lint` passed.
33. **Typecheck:** Final `pnpm typecheck` passed.
34. **Build:** Final `pnpm build` passed with local environment overrides. Existing middleware deprecation notice remains; the local-only OG render logged a missing localhost logo fetch while no server was running, and build completed successfully.
35. **Whitespace:** Final `git diff --check` passed.
36. **Changed files:** Quick Add dialog; wizard step/error helper; shared Quick Add/publication validators; Quick Add/product actions and service field mapping; product schema; Product Form and edit-page mapping; serial-row IDs; compatible-model search brand state; shared photo picker trigger; public product detail query/page; migration 0008 and metadata; package integration script; integration/migration/wizard validator tests; seven existing E2E suites; wizard E2E suite and navigation helper; this report. The condition migration test's expected post-migration row now includes the additive null warranty column. Exact paths follow below.
37. **Risks/limitations:** Warranty migration is required before later promotion. Photos remain a post-transaction operation with explicit retries. Unfinished inline-catalog editor drafts are not saved catalog entities until their existing save action succeeds. Keyboard checks simulate reduced layout and visual viewports and do not replace physical-device testing. Remote-staging suites are intentionally excluded. No deployment follows this review.

Changed paths for review:

- `docs/quick-add-wizard-review.md`
- `drizzle/0008_product_warranty.sql`
- `drizzle/meta/0008_snapshot.json`
- `drizzle/meta/_journal.json`
- `package.json`
- `src/app/(public)/catalogo/[slug]/page.tsx`
- `src/app/admin/productos/[id]/page.tsx`
- `src/db/product-condition-migration.integration.test.ts`
- `src/db/product-warranty-migration.integration.test.ts`
- `src/db/schema/products.ts`
- `src/features/admin/server/admin-services.integration.test.ts`
- `src/features/catalog/data/public-catalog-queries.ts`
- `src/features/images/components/photo-selection.tsx`
- `src/features/inventory/components/quick-add-inventory.tsx`
- `src/features/inventory/domain/quick-add-wizard.ts`
- `src/features/inventory/server/actions.ts`
- `src/features/inventory/server/quick-add-service.ts`
- `src/features/products/components/compatible-models-field.tsx`
- `src/features/products/components/product-form.tsx`
- `src/features/products/components/product-serial-fields.tsx`
- `src/features/products/server/actions.ts`
- `src/features/products/server/product-service.ts`
- `src/validators/admin-product.ts`
- `src/validators/quick-add-inventory.ts`
- `src/validators/quick-add-wizard.test.ts`
- `tests/e2e/direct-image-upload.spec.ts`
- `tests/e2e/helpers/quick-add-wizard.ts`
- `tests/e2e/inventory-condition-hero.spec.ts`
- `tests/e2e/publication-ux.spec.ts`
- `tests/e2e/quick-add-inventory.spec.ts`
- `tests/e2e/quick-add-regressions.spec.ts`
- `tests/e2e/quick-add-wizard.spec.ts`
- `tests/e2e/staging-smoke.spec.ts`
- `tests/e2e/theme-images-search.spec.ts`

Local visual evidence (generated QA artifacts):

- [Desktop: step 1](../test-results/wizard-final/quick-add-wizard-wizard-la-13bec-nd-cancellation-at-1440×900-desktop-chromium/light-step-1.png)
- [Desktop: three ordered photos](../test-results/wizard-final/quick-add-wizard-five-step-1d053--once-and-resets-completely-desktop-chromium/step-4-photos.png)
- [Tablet: final step, dark theme](../test-results/wizard-final/quick-add-wizard-wizard-la-874b1-and-cancellation-at-900×900-desktop-chromium/dark-step-5.png)
- [Mobile: three ordered photos](../test-results/wizard-final/quick-add-wizard-five-step-1d053--once-and-resets-completely-mobile-chromium/step-4-photos.png)
- [Mobile: keyboard visual viewport](../test-results/wizard-final/quick-add-wizard-wizard-la-42c28-and-cancellation-at-393×727-mobile-chromium/keyboard-visual-viewport.png)
- [Full Playwright report](../playwright-report/index.html)
- [Final focused Playwright report](../playwright-report/wizard-final/index.html)
