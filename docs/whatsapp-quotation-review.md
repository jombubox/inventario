# WhatsApp quotation and contact review

Implementation date: October 22, 2026 (America/Mexico_City).

## 1. Business number and destination verification

- Display: **+52 1 81 4391 1759**.
- WhatsApp identifier: **5218143911759**.
- Exact destination: **https://wa.me/5218143911759**.
- WhatsApp's [international-number guidance](https://faq.whatsapp.com/640432094208718/?locale=kk_KZ) specifies the additional `1` after Mexico's `52`. Its [Click to Chat guidance](https://faq.whatsapp.com/5913398998672934) describes international digits and URL-encoded message text.
- A read-only HTTP check returned **302**, preserving the supplied number in `https://api.whatsapp.com/send/?phone=5218143911759&text&type=phone_number&app_absent=0`.
- **The intended business account has not been verified.** A redirect does not prove registration or account identity. Before release, open the exact destination on a real phone with WhatsApp installed and confirm it belongs to Jombubox. No message was sent, and the number was never changed to another representation.

## 2. Central contact configuration

`src/config/contact.ts` contains the display number, WhatsApp identifier, business name, production origin and message helpers. Components do not repeat the phone number. The existing Jombubox logo and site identity remain intact; the requested Jombubox name appears in the new messages and contact metadata.

The business-provided production origin is explicitly configured as `https://inventario-five-mu.vercel.app`. Quotation URLs use this origin rather than a request host, local metadata base or Vercel preview host. If the business later changes its production domain, update this configuration alongside the site's normal canonical configuration. No new environment variable is required.

## 3. Link builder

`buildWhatsAppUrl(message)` constructs a standard HTTPS URL and sets `text` through `URLSearchParams`. Callers supply plain text, not pre-encoded strings. Accents, Ñ, Unicode, newlines, quotes, ampersands, punctuation, plus signs and literal percent sequences round-trip without losing characters or double encoding the supplied message.

There is no WhatsApp SDK, API endpoint, Server Action, tracking request, polling, database write or authentication step in this flow. Links work as ordinary anchors, including when JavaScript is unavailable.

## 4. Product message

The exact public product DTO supplies the title, generated SKU, optional part number, stored slug and public availability category. The message uses an explicit field projection, never serialized database records.

```text
Hola, buen día. 👋

Estoy interesado en cotizar un producto de Jombubox.

Producto: {exact public title}
SKU: {exact generated SKU}
Número de parte: {part number, entire line omitted when absent}

Enlace del producto:
https://inventario-five-mu.vercel.app{publicProductPath(actualSlug)}

¿Me pueden confirmar el precio, la disponibilidad y las opciones de envío?

¡Gracias!
```

The existing `publicProductPath` helper encodes the actual slug. Internal IDs, quantities, acquisition details, locations, notes, audits, suppliers and admin routes are excluded. Opening the link neither sends the message automatically nor records an order, payment or reservation.

## 5–7. Product CTA, availability and mobile bar

The primary **Comprar por WhatsApp** anchor sits directly below the price/SKU/condition card, before the condition list and specifications. Supporting copy asks customers to request a quotation and confirm availability, price and shipping. The former “contact not configured” panel is removed.

Public products with zero saleable stock retain their existing visibility. Their CTA reads **Consultar disponibilidad**, and their message asks whether the product will become available again or can be sourced, with price and shipping options. Reserved or damaged stock does not become saleable stock.

Below 768px, a compact product-specific bar appears only while the main contact group is outside the viewport. It includes the product title and the same link/label. It respects bottom safe-area padding, stays below the header, disappears while the main CTA or footer is visible, and hides while a native dialog or the mobile menu is open. Extra bottom spacing allows the last product content to scroll clear of the bar. At tablet widths, the gallery and information appear side by side.

## 8–9. Desktop and mobile navigation

Desktop navigation includes **Catálogo**, **Contáctanos**, inventory access and the theme toggle. One generic WhatsApp action appears from 1024px where space permits. At narrower desktop widths, the inventory label is shortened visually while retaining its accessible name.

Below 768px, the header retains the brand and theme toggle and provides a native disclosure menu containing Catálogo, Contáctanos, WhatsApp and inventory access. The menu supports keyboard activation, Escape-to-close with focus returned to its summary, and closing after link selection. Its height is constrained to the viewport.

## 10. Contact page

`/contacto` provides a spacious Spanish introduction, a WhatsApp contact card, the supplied formatted number and **Enviar mensaje por WhatsApp**. It explains that the prepared message can be reviewed before sending, suggests sharing a part number/photo and the equipment brand/model, and links back to the catalog.

Only the business-provided contact details are shown. No address, hours, email, social account, response-time promise, shipping coverage or policy was invented. There is no customer-data form.

All generic entry points use:

> Hola, buen día. Me comunico desde la página de Jombubox y me gustaría recibir información sobre sus productos. ¡Gracias!

## 11–14. Homepage, footer and optional actions

- After the shipping carousel, the homepage offers **¿No encuentras la pieza que buscas?**, the requested part-number/photo guidance and **Preguntar por WhatsApp**.
- The footer links to `/contacto` and presents one WhatsApp link with the formatted phone number.
- No generic floating bubble was added: navigation, the contact section and the product-specific mobile bar provide access without competing overlays.
- Catalog cards retain their existing product-detail navigation. No nested WhatsApp links or competing card actions were added.

## 15. Accessibility

WhatsApp actions are descriptive external anchors with `_blank` and `noopener noreferrer`. Screen-reader text announces the new tab; chat icons are decorative. Shared button styles provide focus rings and 44–48px action heights. The long contact-page label wraps at narrow widths. The requested primary blue `#2D6FEA` with white text has approximately **4.59:1** contrast; the existing hover color remains `#225AC0`.

The mobile menu uses native disclosure semantics and supports Escape. Browser checks cover keyboard activation, focus indication, safe viewport bounds, modal suppression and horizontal overflow.

## 16. SEO

The contact page uses Next.js metadata with the absolute title **Contáctanos | Jombubox**, a Spanish description, canonical `/contacto`, Open Graph and Twitter information using the existing social image. The page is included in the normal sitemap. Existing product canonical metadata and JSON-LD URL generation are unchanged.

## 17. Visual review

Light and dark modes retain the existing backgrounds, surfaces, typography and primary action tokens. Automated captures cover **1440×900**, **900×900** and **393×727**, including contact, product, the scrolled main action, homepage contact area and the native full-resolution image viewer. The existing carousel regression captures also remain part of the full suite.

Visual inspection covers the contact card/footer, tablet product layout, mobile bar and scrolled main action in both themes. Local captures are under `test-results/whatsapp-final/`; the final HTML report is `playwright-report/whatsapp-final/index.html`.

## 18–21. Validation

All database-backed tests use the explicitly selected disposable `jumbobox_test` PostgreSQL database on `127.0.0.1:54330`. Image testing uses the local fake R2 service. No production service was modified.

| Check | Result |
| --- | --- |
| ESLint | Passed |
| TypeScript | Passed |
| Unit suite | **273 passed**; the 57 database tests are intentionally skipped here and run separately with the explicit local database |
| Relevant PostgreSQL integration suite | **57 passed** |
| New keyboard activation test | Desktop and mobile passed; WhatsApp navigation intercepted locally; complete product/inventory/movement/audit snapshots unchanged |
| Full desktop/mobile Playwright | **83 distinct scenarios verified**, 15 intentional skips across the full run and corrected-suite rerun; final affected suites: **11 passed, 1 duplicate viewport test skipped**, no failures |
| Production Next.js build | **Passed**; `/contacto` prerendered successfully using explicit local validation configuration |
| `git diff --check` | **Passed**; new text files also checked for trailing whitespace |
| Existing CI security gate: `pnpm audit --prod --audit-level high` | **Passed**; 0 high/critical, 2 existing moderate transitive findings |

The contact unit tests cover the exact number, generic and product templates, optional fields, Spanish/Unicode/special characters/newlines, canonical URLs, explicit privacy projection, distinct products, stock labels/messages and a representative encoded URL under 2,200 characters. PostgreSQL integration verifies real public DTOs, saleable stock behavior, privacy and unchanged inventory. Browser tests verify public/private/archived routes, generic navigation/contact/footer/homepage messages, separate product identities, missing part numbers, keyboard/new-tab behavior, no writes, both themes, mobile bar/menu/footer interaction, original image resolution and desktop zoom.

The existing responsive suite now also visits `/contacto` and a product detail at all eight release widths (320 through 1920px). The full suite retains Quick Add, editing, autocomplete, inventory search, archiving/restoration, direct uploads and existing gallery tests.

Test-count reconciliation with `docs/archive-logo-review.md`: its 314 passing Vitest tests included 258 unit tests and 56 PostgreSQL integration tests in one database-enabled run. The WhatsApp report separates the commands: 273 unit tests plus 57 integration tests, totaling 330. The increase is 15 contact unit cases and one public-DTO quotation integration case; no tests were removed. Browser coverage increased from 77 applicable scenarios plus 15 intentional skips to 83 applicable scenarios plus the same 15 skips, adding three WhatsApp scenarios in each of the desktop and mobile projects. The final affected-suite rerun overlaps the full run and must not be added again to the distinct scenario count.

Run notes: the complete 98-case run finished with 80 passes, 15 intentional skips and three failures. These exposed contact-label overflow at 320px and a new visual-test fixture colliding with an existing primary image on both projects. The label now wraps, the visual test owns and cleans up an independent product/image, and tablet header actions respect their intended breakpoint. The expanded 40-page viewport sweep has a 90-second budget for cold development builds. The affected suites are rerun against freshly seeded disposable fixtures; their final results are recorded above. Full-run and final-suite logs are retained locally as `test-results/whatsapp-regression.log` and `test-results/whatsapp-final-browser.log`.

Dependency and lockfile versions are unchanged, including the previously validated security patches. The two existing moderate findings remain in ExcelJS's transitive uuid/brace-expansion dependencies. The high/critical gate passes without downgrades.

## 22. Files changed

New:

- `src/config/contact.ts`
- `src/config/contact.test.ts`
- `src/components/ui/whatsapp-link.tsx`
- `src/components/layout/public-mobile-menu.tsx`
- `src/features/catalog/components/product-quotation.tsx`
- `src/app/(public)/contacto/page.tsx`
- `tests/e2e/whatsapp-quotations.spec.ts`
- `docs/whatsapp-quotation-review.md`

Updated:

- `src/app/(public)/catalogo/[slug]/page.tsx`
- `src/app/(public)/page.tsx`
- `src/app/globals.css`
- `src/app/sitemap.ts`
- `src/components/layout/public-header.tsx`
- `src/components/layout/public-footer.tsx`
- `src/features/catalog/data/public-catalog-queries.integration.test.ts`
- `tests/e2e/responsive-security.spec.ts`

## 23–24. Database and Git status

No schema change or migration is required. No production migration or seed was run. Publication stays `ACTIVE + isPublic + not deleted`; archive/restoration logic and historical inventory are unchanged.

Branch: **`feat/whatsapp-quotations`**, based on **`dc81455059b92f57aa2124a3a20c7ddbc8c53c65`** from `feat/logo-carousels-archives`. That commit and all carousel/archive work are preserved. The tree was clean before implementation. Release preparation fetched `origin/main` at **`69c89045e3a9806c736ea8dc0a9e54ad7a27ab49`** and confirmed it is already an ancestor; no newer main changes or unrelated branch merge were required. Existing application features, SVG assets, publication/archive services, schemas and patched dependency files remain intact. The implementation and this report are included in the local WhatsApp feature commit. Push, PR and remote CI outcomes must be verified separately against that exact commit; they are not implied by the local validation evidence. No merge to main or production deployment is authorized in this release-preparation task.

## 25–26. Manual verification and release requirements

Before any separately authorized release:

1. On a real phone, open **https://wa.me/5218143911759** and confirm the intended business account. Test an actual product link and a generic contact link; confirm the prepared Spanish text, SKU and canonical product link. Sending a message is a separate user action.
2. Check mobile safe-area behavior on an actual device, WhatsApp app handoff and WhatsApp Web behavior on desktop. Automated Chromium emulation cannot certify these operating-system/app interactions or account identity.
3. Review the local feature diff and the preserved archive/carousel work. GitHub write access was blocked in the earlier release task; an authorized account is needed if that remains unresolved.
4. Run the repository's normal reviewed release process using the existing production configuration. No new environment variable, database migration, R2 mutation, DNS change or Cloudflare Worker change is required for this feature.

**This task does not deploy production.**
