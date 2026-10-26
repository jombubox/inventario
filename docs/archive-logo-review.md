# JumboBox: logotipos y administración de archivados

Candidate branch: `feat/logo-carousels-archives`. Local implementation only; no push, deployment, production mutation, production seed, R2 change or production migration.

## 1–3. SVG audit, classification and organization

The original untracked `public/images/marcas/` folder contained exactly 18 SVG files. Existing source references were searched before moving files; none referenced these assets. Artwork and filenames are preserved byte for byte. SVG view boxes were inspected for intrinsic proportions; no scripts or external image references were found. Shipping `_bg` files are alternate background artwork, retained without displaying the same company twice. There are no uncertain assets and no `otros` directory is needed.

| Original filename | Identified company | Classification | New folder | Public carousel |
|---|---|---|---|---|
| dhl.svg | DHL | Shipping | paqueterias | Yes |
| dhl_bg.svg | DHL | Shipping, background variant | paqueterias | Alternate retained |
| estafeta.svg | Estafeta | Shipping | paqueterias | Yes |
| estafeta_bg.svg | Estafeta | Shipping, background variant | paqueterias | Alternate retained |
| fedex.svg | FedEx | Shipping | paqueterias | Yes |
| fedex_bg.svg | FedEx | Shipping, background variant | paqueterias | Alternate retained |
| hisense.svg | Hisense | Electronics | electronicos | Yes |
| jvc.svg | JVC | Electronics | electronicos | Yes |
| lg.svg | LG | Electronics | electronicos | Yes |
| onn.svg | onn. | Electronics | electronicos | Yes |
| philips.svg | Philips | Electronics | electronicos | Yes |
| pioneer.svg | Pioneer | Electronics | electronicos | Yes |
| samsung.svg | Samsung | Electronics | electronicos | Yes |
| sansui.svg | Sansui | Electronics | electronicos | Yes |
| sharp.svg | Sharp | Electronics | electronicos | Yes |
| sony.svg | Sony | Electronics | electronicos | Yes |
| tcl.svg | TCL | Electronics | electronicos | Yes |
| vios.svg | Vios | Electronics | electronicos | Yes |

Both folders are under `public/images/marcas/`. There were no spaces, accents or unsafe filenames to normalize. No assets were downloaded or uploaded to R2.

## 4–8. Reusable carousel, placement, interaction and accessibility

`BrandLogoCarousel` receives a title, accessible description, typed logo collection and optional compact spacing. `brand-logos.ts` holds static paths and intrinsic aspect ratios. It uses the existing Next Image and button conventions with local, unoptimized SVG URLs. Each company appears once, with its name in alt text and no redundant visible caption. White logo surfaces preserve original artwork contrast in both themes, without altering its colors.

The current homepage consists of the hero/search and inventory summary, component/brand category discovery, recent products and catalog CTA, then the footer. It had no separate shipping information or benefits section. Electronics logos sit between category discovery and recent products with compact spacing. Shipping logos follow recent products, immediately before the footer, with a neutral instruction to consult shipping options. Neither section claims commercial partnerships or official distribution.

The carousel uses native horizontal scrolling, scroll snap, touch/trackpad scrolling, previous/next buttons and a focusable labelled list. Arrow keys move a page; Home/End reach either end. Buttons reflect scroll boundaries. Desktop uses generous gaps and 208px containers; small screens use 176px containers with compact gaps. Logos retain their own proportions inside a bounded height and width. Scrolling stays within the list. No dependency, autoplay, infinite duplication, timer or automatic motion was added. Smooth manual navigation respects `prefers-reduced-motion`; the existing global reduced-motion rules remain active.

## 9–10. Entity and status audit

| Entity | Existing state | Previous delete/deactivate behavior | Restore before this change | Dependencies / decision |
|---|---|---|---|---|
| Products | `status`: DRAFT/ACTIVE/ARCHIVED, `isPublic`, nullable `deletedAt` | Archive sets ARCHIVED and private; `deletedAt` is soft deletion | No explicit centralized restore; editing status could reactivate an archived product | Brands/types, compatibilities, serials, photos, inventory and movements. ARCHIVED or soft-deleted records belong in Archivados; draft/private/zero stock/condition do not imply archival. |
| Brands | `active` | Archive/deactivate blocked if used as primary or compatible brand | Matching name resolution silently reactivated inactive records | Preserve existing usage restriction, IDs, aliases, code, slug, product links and historical names. Explicit restore replaces silent reactivation. |
| Piece types | `active` | Archive/deactivate blocked if referenced by any product | Matching name resolution silently reactivated inactive records | Preserve existing usage restriction and relationships. Explicit restore. |
| Physical locations | `active`; hierarchical `parentId` | General edit could deactivate without an occupancy guard | General edit could reactivate | Shared protected archive/restore. Check stock, active children and ancestor activity; retain all parent links. |
| Boxes | Location row with type BOX and `active` | Empty unused boxes physically deleted; historical empty boxes deactivated; occupied boxes blocked | Edit only for retained rows | All boxes now archive reversibly, including unused empty boxes. No new schema field. |
| Bags | Location row with type BAG and `active`; legacy bag label also exists on inventory | General location state | General location edit | Location-backed bags included in Ubicaciones. Legacy free-text bag labels are not separate entities and are not archived independently. |
| Brand/type aliases | `active` on subordinate aliases | Managed with catalog resolution/rename, no independent management section | No standalone workflow | Retained as subordinate master data. Inactive parent cannot be silently reactivated via an alias. |
| Compatible models | Product compatibility associations, no standalone active/archive state | Persisted with product | Not an independent entity | No invented archive category. Existing historical associations retained; new suggestions exclude archived source products. |
| Inventory items | AVAILABLE/RESERVED/DAMAGED/SOLD/SCRAPPED and quantity | Stock movements/adjustments; sold/scrapped are historical stock states | Stock entry/return through established domain service | Not archival states. Records and history retained, including accessible stock for archived products. New stock selection/entry excludes archived products/containers. |
| Movements / audit / import jobs and rows | Historical operation/status fields | Historical records | Not reversible master records | Remain historical and immutable under this feature. No archival category. |
| Legacy auth tables | `user.active` / banned plus sessions/accounts | Schema explicitly retained for legacy FK/migration compatibility; runtime single-admin auth does not use these tables | No current management workflow | Not exposed as archiveable entities. Existing environment-backed signed admin session remains unchanged. |

## 11–13. Archivados page and sidebar

`/admin/archivados` uses the existing protected App Router admin layout and also calls `requireAdmin()` in the page. Both desktop and mobile navigation share the new Archivados entry, next to physical organization. The archive icon follows the application's existing inline Lucide-style SVG convention, avoiding a new icon dependency. Breadcrumbs display Archivados.

Five compact category links: Productos, Marcas, Tipos de pieza, Ubicaciones and Cajas. Ubicaciones includes bags and other non-box location types. Category links show actual aggregate counts. The page has Spanish descriptions, category-aware search, empty states, tables with useful identifiers/relationships and URL pagination. Product rows link to authenticated details. Archived product details retain the photo viewer, inventory summary and historical brand/type, with explicit restoration before editing. The archive list uses the existing light/dark design tokens and an internally scrollable table on narrow displays.

## 14–16. Separation, archive actions and restoration

Normal product SQL queries always require non-deleted and non-ARCHIVED records, even with an archived status manually supplied in the URL. Drafts remain manageable. Normal brand/type lists require `active=true`; normal locations require `active=true`. Ordinary edit and Quick Add status controls no longer offer Archivado, directing users to the explicit archive action.

Product, brand, type and box actions now say Archivar, explain the consequence and confirm it. Other location types, including bags, share the same archive form/service. General location edits cannot bypass occupancy checks or restore an inactive location; the UI's former active checkbox is replaced with explicit archive/restore actions. Empty boxes retain their IDs instead of being deleted.

Restore is an authenticated, validated server action. It locks the current record, validates its state/version and dependencies, changes the existing row transactionally, writes audit data and invalidates affected views. Double actions return a controlled state error; stale updates cannot overwrite newer changes. No record, SKU, part number, photo, serial, compatibility or historical movement is recreated. A persistent Spanish success banner remains visible after the acted-on row disappears.

## 17–20. Relationship, stock, publication and selection safety

Referenced brands/types remain blocked from archival under the existing business rule, including references from archived products. The Spanish message explains their usage. No links are deleted/nullified and no SKU is regenerated. Existing inactive legacy relationships remain readable. Inline create/name/alias resolution refuses archived catalog matches and directs the administrator to Archivados.

Location archive locks the container, checks physical stock in its subtree (including legacy inactive descendants), and blocks active children. A parent must be restored before its child; the active ancestor chain is validated and locked. No stock is moved or detached. Inventory entry, move destinations, quantity increases, and returns acquire active-location locks, so concurrent archival cannot make new stock land inside an archived container. Quick Add retains its existing box/parent locks. Inventory quantities, historical movements and location IDs remain untouched by archive/restore.

The old product archive operation erased previous public visibility. Since no reliable pre-archive state field exists, restoration always produces `DRAFT`, `isPublic=false`, `deletedAt=null`. Publication requires explicit activation/public selection. Public catalog, homepage, details, related products and sitemap already share ACTIVE/public/non-deleted predicates, which continue to exclude archived and restored-private products. Direct public URLs use the established not-found behavior.

Quick Add product search and inventory product selectors exclude archived/soft-deleted products. Brand/type selectors already required active rows. Compatible model suggestions now also exclude archived/deleted source products. Location/box selection retains active-state filtering, with refreshed options fetched when Quick Add opens and transactional checks protecting stale forms. Inventory/history listings remain available for stock management; archival of the commercial product does not erase physical stock.

## 21–24. Audit, invalidation, performance and migrations

Existing audit records are reused: PRODUCT/BRAND/COMPONENT_TYPE/LOCATION_ARCHIVED plus corresponding *_RESTORED actions, with before/after state and existing DB timestamps. Spanish labels are supplied for restore actions. The current single-admin authentication has no relational user ID; audit `userId=null` is preserved consistently, with no fabricated actor record or second audit system.

The shared revalidation function invalidates `/admin` as a layout (including archive, list, edit, inventory, dashboard and selector consumers), public homepage/catalog/product routes and sitemap. Existing no-store API selection/search behavior is retained. Per-product actions additionally retain their established detail revalidation.

Archive listing loads 20 rows in SQL with escaped case-insensitive search and deterministic name/ID ordering. Counts are four aggregate queries (locations grouped by type), independent of record count. Each category list uses one filtered count and one bounded row query; parent/usage summaries use indexed correlated subqueries within that query, not separate application queries per row. Out-of-range pages clamp to the final page. Search/category/page are stored in the URL; category changes reset the search/page.

**No migration or schema change is required.** Existing archival fields and indexes are reused. Existing migrations were applied to disposable PostgreSQL and rerun successfully as a no-op. No production database was contacted for mutations.

## 25–31. Validation

Validation is performed against a dedicated local `jumbobox_test` PostgreSQL 17 container. E2E uses the existing Neon WebSocket proxy and fake R2 server. No mutating production tests are allowed by the fixture guards.

Final validation results:

| Check | Result |
|---|---|
| pnpm install --frozen-lockfile | Passed; pnpm 10.15.0, no dependency downgrade |
| pnpm lint | Passed |
| pnpm typecheck | Passed |
| pnpm test | 50 suites, 314 tests passed, including PostgreSQL coverage |
| pnpm test:integration | Explicit run: 4 suites, 56 tests passed against disposable PostgreSQL |
| Existing migrations | Applied successfully to disposable DB; second application succeeded as a no-op |
| pnpm build | Passed on Windows with Next.js 16.4.1 |
| Linux OpenNext | Passed using Dockerfile.ci, Node 22 Linux, OpenNext Cloudflare 1.20.7; bundle generated only |
| Full desktop/mobile E2E | 77 passed, 15 expected skips, zero failures (10.5 minutes); desktop 42 passed / 4 skipped, mobile 35 passed / 11 skipped |
| Focused archive/carousel/catalog E2E | 6 passed, zero skipped, covering both desktop and mobile |
| Final carousel/archive visual recapture | 4 passed after using actual theme controls and settling transitions; final light/dark screenshots reviewed |
| pnpm audit --prod --audit-level high | Passed; zero high/critical, two moderate transitive findings described below |
| git diff --check | Passed; touched source files normalized to LF, SVG bytes preserved |
| SVG inventory / dimensions | Passed; all 18 local assets retained, 15 distinct displayed companies, no broken paths |
| Visual review | Desktop/tablet/mobile homepage and desktop/mobile Archivados inspected in both themes |

The full E2E skips are the suite's existing device-specific duplicate cases and remote staging/redeploy smoke tests, which require an explicitly supplied staging target. They are not skipped new archive/carousel scenarios. New carousel checks run 1440 × 900, 900 × 900 and 393 × 727 in both themes, exercise previous/next and keyboard navigation, validate image decoding and page overflow, and use actual CDP touch gestures in the mobile Chromium project. Archive E2E confirms category navigation, case-insensitive search, normal-list exclusion, restoration, stable ID/SKU and private draft state. Existing Quick Add, compatible-model creation, warranty/condition/provenance, image uploads/order/primary/original viewers, stock operations, search, theme and authentication scenarios remain passing.

Visual artifacts (local, ignored test output):

- `test-results/archives-carousels-logo-ca-91ec3-nd-fit-all-themes-and-sizes-desktop-chromium/`: homepage screenshots at all three widths, light/dark.
- `test-results/archives-carousels-logo-ca-91ec3-nd-fit-all-themes-and-sizes-mobile-chromium/`: mobile-project homepage screenshots and touch coverage.
- `test-results/archives-carousels-product-c02da-d-page-without-republishing-desktop-chromium/archives-light.png` and `archives-dark.png`: desktop archive page.
- `test-results/archives-carousels-product-c02da-d-page-without-republishing-mobile-chromium/archives-light.png` and `archives-dark.png`: mobile archive page.

Archival integration covers product state/visibility, legacy soft deletion/dependencies, unchanged stock/history, used brand/type protection, inactive catalog exclusion, explicit restoration, no implicit name-based reactivation, occupied containers, parent-before-child restoration including bags, repeated/concurrent archive/restore, stale versions, pagination, count/query bounds and existing inventory races. Action security tests block anonymous calls through every product/brand/type/box/location archive entry point and restoration, and reject invalid IDs before persistence.

Security gate: the original Next.js 16.3.8 failed with newly published high/critical advisories. Next.js, `@next/env` and `eslint-config-next` were updated together to 16.4.1; Sharp 0.35.5 and Wrangler 4.149.0 are unchanged. The high/critical CI audit gate now passes. Two moderate transitive advisories remain: `exceljs > uuid@8.3.2` and `exceljs > archiver > … > brace-expansion@1.1.20`. Broad transitive major overrides were not introduced for these unrelated moderate findings.

Upstream patch references:

- https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r
- https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw
- https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr

The patched ImageResponse rejects fetching a logo from loopback. The existing Open Graph route now reads the same trusted local `public/logo.svg` at build time and embeds it in its generated PNG, preserving artwork and avoiding any remote-origin dependency. This is separate from the public carousel, which uses static image URLs. Next dev also regenerated the existing AGENTS.md heading level; its framework guidance is retained.

## 32. Files changed

The 18 supplied SVGs were relocated as listed in the asset table. Source, test and documentation changes:

- `AGENTS.md`
- `docs/archive-logo-review.md`
- `package.json`
- `pnpm-lock.yaml`
- `src/app/(public)/page.tsx`
- `src/app/admin/archivados/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/productos/[id]/page.tsx`
- `src/app/admin/productos/page.tsx`
- `src/app/admin/ubicaciones/page.tsx`
- `src/app/opengraph-image.tsx`
- `src/components/layout/admin-breadcrumbs.tsx`
- `src/components/layout/admin-nav-link.tsx`
- `src/components/layout/admin-navigation.ts`
- `src/features/admin/server/admin-services.integration.test.ts`
- `src/features/archives/components/archive-feedback.tsx`
- `src/features/archives/components/archive-record-form.tsx`
- `src/features/archives/data/archive-queries.ts`
- `src/features/archives/domain/archives.ts`
- `src/features/archives/server/actions.test.ts`
- `src/features/archives/server/actions.ts`
- `src/features/archives/server/archive-service.ts`
- `src/features/archives/server/revalidation.ts`
- `src/features/audit/data/audit-log.ts`
- `src/features/catalog/components/brand-logo-carousel.tsx`
- `src/features/catalog/domain/brand-logos.test.ts`
- `src/features/catalog/domain/brand-logos.ts`
- `src/features/inventory/components/quick-add-inventory.tsx`
- `src/features/inventory/data/admin-inventory-queries.ts`
- `src/features/inventory/data/quick-add-queries.ts`
- `src/features/inventory/server/inventory-service.ts`
- `src/features/inventory/server/quick-add-service.ts`
- `src/features/locations/components/location-forms.tsx`
- `src/features/locations/data/admin-location-queries.ts`
- `src/features/locations/server/actions.ts`
- `src/features/locations/server/location-service.ts`
- `src/features/products/components/archive-product-form.tsx`
- `src/features/products/components/catalog-management.tsx`
- `src/features/products/components/product-form.tsx`
- `src/features/products/data/admin-catalog-queries.ts`
- `src/features/products/data/admin-product-queries.ts`
- `src/features/products/server/actions.ts`
- `src/features/products/server/catalog-actions.ts`
- `src/features/products/server/catalog-service.ts`
- `src/features/products/server/product-service.ts`
- `src/lib/format.ts`
- `tests/e2e/archives-carousels.spec.ts`
- `tests/e2e/catalog-management.spec.ts`
- `tests/e2e/quick-add-inventory.spec.ts`
- `tests/e2e/staging-smoke.spec.ts`

## 33–34. Limits and production requirements

Archive dates are omitted because the existing product archive state and catalog/location active flags do not store archival timestamps. `updatedAt` is used only for concurrency, never misrepresented as archive time. Historical soft-deleted products are included without inventing dates.

Referenced brand/type archival remains intentionally prohibited. Stock-bearing/parent containers must be emptied or have children archived/reparented first. Restoration of a child with inactive ancestors is deliberately blocked. Existing normal selector/hierarchy bounds (500/1,000 where already present) are retained; the new archive page itself is paginated.

Browser coverage is Chromium desktop and emulated Android/touch; physical-device, Safari and Firefox verification are outside this local run. The existing middleware-to-proxy deprecation and existing logo/hero loading notices are not refactored here.

Disposable local services were stopped after validation. The retained `jumbobox-archives-postgres` container can be restarted for another explicitly local test run; it contains only `jumbobox_test` fixtures. No workstation environment files were changed.

Production rollout requires review, frozen install of the updated lockfile, the existing CI gates, and a separately authorized Vercel deployment. No new environment variables, R2 settings, DNS changes, database migration or seed is required. Existing pending historical migrations remain governed by the application's normal release procedure. Cloudflare is validated as a staging build only. Rollback is the prior reviewed code release; archive state remains reversible through the new UI, with IDs/history retained. Do not downgrade the security-patched framework as an operational rollback.
