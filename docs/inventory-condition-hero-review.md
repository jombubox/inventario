# Inventory, product condition and hero review candidate

Validated locally on 2026-10-04. Base commit: `0e2c1340b2f1913c467579d54be739f01d5beaac`. Changes remain uncommitted for review. No deployment, production migration, production seed, production data/environment/storage change, Cloudflare staging change or DNS change was performed in this iteration.

## Requested 30-point report

1. **Inventory actions before:** each row had an inline disclosure headed “Mover, ajustar o editar este registro”. It expanded five existing forms for physical details, entry/return, exit/sale, movement and adjustment.
2. **Inventory actions now:** the list presents one **Editar** button. Its modal keeps all five operations; physical details appear first. Closing the modal returns focus to the trigger.
3. **Integration:** `InventoryEditor` wraps the existing shared native-dialog `Modal` and renders the existing `InventoryRowActions` on demand. Existing server actions, authorization, validation, concurrency checks and stock/audit services remain in use. Updated acceptance tests still execute adjustment and movement through this entry point.
4. **Area A:** clear **Caja** and **Bolsa** pills, such as Caja 18 / Bolsa 7. Missing values display Sin caja / Sin bolsa. Explicit legacy bag labels take precedence over a hierarchical BAG name; box names come from actual BOX ancestors.
5. **Area B:** the actual generated product SKU appears under the product title with an explicit SKU label, monospace styling and selectable text.
6. **SKU placement:** SKU is shown once per list item. Product title remains primary; the internal inventory-record code moves to the editor header. Generation, identity rules and collision handling are unchanged. Text wraps safely and selecting it selects the complete SKU.
7. **Location data/query:** existing `locationId`, hierarchy type/parent/name and `legacyBagNumber` supply the display. The existing hierarchy query now selects type; an in-memory resolver derives placement with the existing breadcrumb validation. No fake columns or parsing of legacy location codes. An integration assertion verifies exactly **three list statements**, with no extra query per row.
8. **Prior condition concept:** inventory lots already had granular grading (NEW, USED_EXCELLENT, USED_GOOD, USED_FAIR, FOR_PARTS, UNKNOWN), used by catalog availability/filtering. There was no suitable persistent product-level Nuevo/Usado field. Lot grading remains independent from product condition, product status and public visibility.
9. **Condition implementation:** nullable typed `products.condition`, controlled values `NEW` / `USED`, Spanish labels Nuevo / Usado, shared domain labels, Zod validation and database CHECK constraint. Create/update audit snapshots include condition. Existing-product Quick Add preserves its product condition.
10. **Migration:** `drizzle/0007_shiny_sunfire.sql`, generated snapshot and journal entry add only the nullable text column and CHECK. No backfill, new enum or index. Applied only to disposable local PostgreSQL. The integration test builds migrations 0–6 in a fresh random local database, inserts legacy product/stock, applies migration 7, verifies complete data preservation and null condition, rejects an invalid value, and verifies the second migrate is a no-op. A future release requires an explicitly authorized migration before code using this column goes live.
11. **Defaults:** new UI creations default to **Nuevo**. Existing null products display **Sin especificar**, and ordinary edits preserve null. Older internal import/service callers that omit condition remain unclassified rather than being silently labelled new. An omitted update preserves the existing value.
12. **Create/publish:** Quick Add's new-product step offers a labelled Condición select before publication. Its hidden submission value persists through the existing transaction. The regular product-create form also includes the field. Existing Activo, public visibility, MXN and price behavior remains intact.
13. **Edit:** the regular Product edit form receives and persists condition. Existing unclassified products offer Sin especificar; choosing Nuevo/Usado classifies them. Editing condition preserves SKU. E2E covers Usado → Nuevo and unchanged null edits.
14. **Public product page:** a semantic Condición `dt`/`dd` appears with price and SKU metadata. It shows Nuevo, Usado or Sin especificar. The existing detail query selects condition without an additional database round trip.
15. **Catalog/search:** product-condition cards, filters, search and JSON-LD were not expanded. Existing catalog filters continue using inventory grading. Minimum requested public-detail display is implemented. This avoids changing existing inventory availability or search semantics.
16. **Hero:** `HeroBoardBackground` uses Next Image as an absolutely positioned decorative layer in the existing isolated hero. Horizontal and vertical gradients keep the text/search area clear. The layer is clipped to the hero and has no pointer events; its absolute positioning reserves no additional layout height.
17. **PNG:** final asset [public/images/hero-electronics.png](../public/images/hero-electronics.png), 1280 × 853 RGBA, **245,391 bytes**. Generated using the builtin image tool, then optimized using the project's existing Sharp dependency without adding packages. Original generated PNG is preserved outside the repository. Full prompt and paths are below.
18. **Themes:** compatible with the existing `data-theme` mechanism and tokens. Image opacity is 0.16 in light mode and 0.28 in dark mode; masks use the background token. E2E toggles via the actual theme button, reloads to verify persistence and asserts both opacity values. Desktop/mobile images were visually reviewed.
19. **Mobile:** title/SKU and box/bag span the card; quantity and status share a row, followed by parent location and full-width Editar. Modal forms scroll vertically. E2E verifies document overflow, condition-select visibility in the modal, modal horizontal bounds, public condition readability and hero CTA operation at the mobile viewport.
20. **Accessibility:** Editar has an explicit SKU-based accessible label. Existing dialog focus management, Escape and focus restoration are retained and tested. Condition fields have associated labels and invalid-state/error feedback. Public metadata uses semantic definition lists. Hero has an empty alt and an aria-hidden parent, and cannot intercept input. Existing button tap sizes are reused.
21. **Unit:** `pnpm test` passed: **189 passed**, 41 integration tests intentionally skipped in this mode; 38 files passed / 3 skipped. Added controlled-condition/default/null validation and placement tests, including missing bag and cyclic hierarchy handling.
22. **Integration:** `pnpm test:integration` passed: **41 passed in 3 files**. All database writes targeted guarded disposable local PostgreSQL. Coverage includes migration data preservation/idempotence, condition persistence/edit/public reads, unchanged existing-product condition, placement and bounded inventory queries.
23. **Desktop E2E:** full Playwright suite **30 passed / 3 skipped**. The four new UX checks passed again in the focused final run. Existing adjustment/movement/security, upload, publication and theme/image/search coverage also ran.
24. **Mobile E2E:** full suite **24 passed / 9 skipped**; four new checks passed again in the focused final run. Combined full suite: **54 passed / 12 skipped** (5.7 minutes). Combined focused final suite: **8 passed** (48.9 seconds). Skips are existing staging-only tests and deliberately non-duplicated stateful/viewport scenarios; staging was not exercised.
25. **Lint:** `pnpm lint` passed, including a final run after screenshot/assertion refinements.
26. **Types:** `pnpm typecheck` passed. The final build also completed its TypeScript check.
27. **Build:** `pnpm build` passed using local fixture environment/database and fake storage settings. Existing Next.js middleware→proxy deprecation warning remains outside this task. Browser runs also reported the existing logo LCP suggestion and NO_COLOR/FORCE_COLOR warning.
28. **Diff:** `git diff --check` passed. Final candidate review found no environment files, credentials, temporary test artifacts or logs among changed files. Logs and screenshots are stored outside the repository; the PNG and generated migration metadata are intentional assets.
29. **Files changed:** the complete 36-file candidate manifest is below, grouped by purpose.
30. **Remaining limitations:** no marked A/B screenshot was supplied, so placement follows the requested information hierarchy. Product condition is a product-level classification, not per-lot grading; products with mixed lot grades still have one product condition. Catalog condition filters retain their original lot semantics. The additive migration is required for any future rollout and has not been applied to production. Mobile verification uses Chromium emulation, not physical iOS/Safari. No hosting/storage architecture changed; no production smoke test was run because this task expressly requests local review only.

## Changed files

Schema/migration and integration wiring:

- `drizzle/0007_shiny_sunfire.sql`
- `drizzle/meta/0007_snapshot.json`
- `drizzle/meta/_journal.json`
- `package.json`
- `src/db/schema/products.ts`
- `src/db/product-condition-migration.integration.test.ts`
- `src/features/admin/server/admin-services.integration.test.ts`

Inventory UI, queries and Quick Add:

- `src/app/admin/inventario/page.tsx`
- `src/features/inventory/components/inventory-editor.tsx`
- `src/features/inventory/components/inventory-forms.tsx`
- `src/features/inventory/components/quick-add-inventory.tsx`
- `src/features/inventory/data/admin-inventory-queries.ts`
- `src/features/inventory/domain/inventory-placement.ts`
- `src/features/inventory/domain/inventory-placement.test.ts`
- `src/features/inventory/server/actions.ts`
- `src/features/inventory/server/actions.test.ts`
- `src/features/inventory/server/quick-add-service.ts`
- `src/validators/quick-add-inventory.ts`

Product condition and public detail:

- `src/app/admin/productos/[id]/page.tsx`
- `src/app/(public)/catalogo/[slug]/page.tsx`
- `src/features/products/components/product-form.tsx`
- `src/features/products/domain/product-condition.ts`
- `src/features/products/server/actions.ts`
- `src/features/products/server/product-service.ts`
- `src/features/catalog/data/public-catalog-queries.ts`
- `src/features/catalog/seo/product-json-ld.test.ts`
- `src/validators/admin-product.ts`
- `src/validators/admin-product.test.ts`
- `src/validators/product.ts`

Hero, browser coverage and review record:

- `public/images/hero-electronics.png`
- `src/app/(public)/page.tsx`
- `src/app/globals.css`
- `src/features/catalog/components/hero-board-background.tsx`
- `tests/e2e/admin-security.spec.ts`
- `tests/e2e/inventory-condition-hero.spec.ts`
- `docs/inventory-condition-hero-review.md`

## Evidence and artwork

Local evidence directory: `C:/Users/yo/Desktop/work/JumboBox-releases/local-inventory-condition/`. Logs: `lint-final.log`, `types-final.log`, `unit-final.log`, `integration-first.log`, `e2e-full.log`, `e2e-focused-final.log`, `build-final.log`. Screenshots from the complete run are in `visual-full/`; focused final condition/public/editor/theme screenshots are in `visual-final/`. These paths deliberately sit outside the working tree.

Builtin tool: `image_gen.imagegen`, transparent background enabled. Final saved asset: `C:/Users/yo/Desktop/work/JumboBox/public/images/hero-electronics.png`. Original: `C:/Users/yo/.codex/generated_images/01a0fe32-0369-7c20-a3df-979de5f29b69/exec-57202c5c-15ca-4af2-8d68-0027574b80ac.png`.

Full generation prompt:

> Use case: stylized-concept. Asset type: decorative PNG background for the CURRENT JumboBox electronics spare-parts website hero. Primary request: a restrained, professional electronics-board illustration, fine copper traces, connector pins, small chips and two overlapping circuit boards, clean and intentional, not stock-photo clutter. Composition: wide landscape 3:2, board detail concentrated at right and bottom-right with generous empty transparent space fading to the left for existing hero text. Transparent background, genuine alpha. Style: subtle polished technical illustration with lightly dimensional components, fine details, calm blue-gray boards and muted warm metallic traces, compatible with light and dark website backgrounds when rendered at reduced opacity. No text, no logos, no labels, no luminous neon, no heavy shadow, no busy collage. Decorative rather than a product listing photograph. Keep a clean silhouette and generous transparent outer margins.
