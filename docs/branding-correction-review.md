# Jombubox branding correction

Official display name: **Jombubox**. Footer: `? 2026 Jombubox. Todos los derechos reservados.`

## Release state

Inspected on October 30, 2026. The starting branch was `main` at `495297ca64d86bac5ad25e69d9723e1e18be89bc`; `git ls-remote` confirmed the same commit on remote main. The only starting working-tree edit was the requested footer correction, which is retained. The preceding marquee/branding release is already pushed. Public read-only requests to the configured Vercel production origin returned HTTP 200, the preceding capitalization in the document/SVG titles, and the marquee pause text. This is prepared as a follow-up on `fix/jombubox-branding`. Authenticated Vercel inspection returned Forbidden, so the exact deployed commit was not verified. No commit, push, merge or deployment was performed. No production database, object storage, DNS, environment or hosting setting was changed.

## Display locations corrected

- Shared SVG wordmark and its SVG title; the original lowercase letter outline is restored. This reaches public navigation/footer, login, admin sidebar/mobile header and generated Open Graph artwork. The symbol and assets are retained.
- Homepage, catalog/detail copy and metadata; global title templates, application/creator/publisher metadata, Open Graph/Twitter titles, descriptions and image alt text. Contact metadata receives the name from the shared contact configuration.
- Login greeting/description, loading status/spinner, global error message, admin dashboard/metadata/product empty state, image deletion confirmation, and navigation accessibility labels.
- Shared business name, generic WhatsApp contact text and product quotation messages. Destination number, URL encoding, product identity and canonical quotation origin are unchanged.
- Export/import download filenames, workbook creator/company, workbook headings/instructions and import-error CSV filename. These are display-only generated artifacts.
- Operator documentation, seed progress text, new QA/sample descriptions/notes and generated QA image caption. The QA caption now supports the lowercase glyphs required by the official spelling. Historical record identity markers are retained.
- Public footer uses the exact fixed 2026 text requested. No email template or PWA manifest is present in the application source/assets.

## Preserved technical and historical occurrences

Case-insensitive searches intentionally continue to match technical values. They must not be interpreted as display branding:

- Repository URLs, account/project/worker/bucket names, package name, file-system paths and historical evidence paths; external URLs and their hostname spelling.
- Environment keys, local database names/guards, migration fixture names, Docker container names, test URLs and fixture credentials. Authentication credentials are unchanged.
- Session cookie `jumbobox-admin-session`, theme storage/event `jombubox-theme` / `jombubox:theme-change`, and HMAC protocol namespace `jumbobox-image-upload-v1`. Renaming these could invalidate sessions, stored preferences or upload signatures.
- QA/sample record title prefixes, sample-location marker and matching search queries in the two manual fixture scripts. These identify historical records for idempotence/cleanup. No stored title, image, SKU, audit entry, note or other historical record was rewritten. The fixture setup/cleanup commands were not executed against historical data.

## Search and browser audit

Full tracked-codebase search: `git grep -I -n -i -E "j[ou]mb[ou][ _-]*box"`. Source/assets were also searched with `rg`, including hidden repository configuration while excluding generated files, dependencies and secrets. The audit covers all requested spaced and unspaced variations.

Runtime source/assets contain 59 matching lines. **Zero incorrect user-facing branding lines remain** after separately accounting for four lines defining the stable cookie, theme storage/event and upload-signature namespace. The complete tracked-tree search has 124 deliberately retained technical/historical matching lines, including fixture credentials and URLs. Their exact file/line inventory is retained locally at `test-results/branding-audit/preserved-technical-occurrences.txt`.

A separate browser display audit checked 14 routes in desktop-light, desktop-dark, mobile-light and mobile-dark configurations: **56 page checks, zero incorrect rendered names, zero horizontal overflow**. It inspected rendered text, document titles, selected SEO/social metadata, image alt text and aria-labels; public footers matched the exact required copyright. Routes: home, catalog, product detail, contact, login, admin dashboard, product list, product creation, product editing, inventory, archives, brands, locations and imports. The template download filename was checked in all four contexts. Screenshots and the JSON results are retained locally in `test-results/branding-audit/`. Logo outlines and representative desktop-admin/mobile-login/mobile-contact screenshots were visually reviewed. The QA caption was rendered and inspected independently without executing setup, cleanup, database or storage actions.

## Validation

- Lint: passed.
- Typecheck: passed.
- Unit/integration: 330 tests across 51 files passed using only disposable local PostgreSQL; all four database integration suites were enabled.
- Production build: passed.
- Relevant browser regressions: 36 passed, 6 existing project-specific skips, across seven specification files in Chromium desktop and emulated Android.
- Browser branding audit: 56 checks passed.
- Diff whitespace check: passed.

The continuous marquee TSX/CSS files have no diff. Authentication, inventory/archive logic, upload/signature code, schema/migrations, environment files, package/lockfile, routing and hosting configuration have no diff. Existing tests changed only branding expectations/descriptions. The framework middleware deprecation and existing development image-loading notices are not addressed. Physical devices, Safari and Firefox were not tested.

## Every changed file (44)

```text
README.md
docs/admin.md
docs/archive-logo-review.md
docs/branding-correction-review.md
docs/data-model.md
docs/deployment.md
docs/imports.md
docs/inventory-condition-hero-review.md
docs/og-image-prompt.md
docs/public-catalog.md
docs/quick-add-ux-review.md
docs/whatsapp-quotation-review.md
public/logo.svg
src/app/(public)/catalogo/[slug]/page.tsx
src/app/(public)/catalogo/page.tsx
src/app/(public)/page.tsx
src/app/admin/layout.tsx
src/app/admin/page.tsx
src/app/admin/productos/page.tsx
src/app/api/imports/template/route.ts
src/app/global-error.tsx
src/app/layout.tsx
src/app/loading.tsx
src/app/login/page.tsx
src/app/opengraph-image.tsx
src/components/layout/admin-header.tsx
src/components/layout/admin-sidebar.tsx
src/components/layout/brand.tsx
src/components/layout/public-footer.tsx
src/components/layout/public-header.tsx
src/config/contact.test.ts
src/config/contact.ts
src/db/seed.ts
src/features/admin/server/admin-services.integration.test.ts
src/features/exports/server/inventory-export.ts
src/features/images/components/product-image-manager.tsx
src/features/imports/components/import-wizard.tsx
src/features/imports/server/template-workbook.test.ts
src/features/imports/server/template-workbook.ts
src/scripts/production-samples.ts
src/scripts/qa-data.ts
tests/e2e/admin-security.spec.ts
tests/e2e/publication-ux.spec.ts
tests/e2e/whatsapp-quotations.spec.ts
```
