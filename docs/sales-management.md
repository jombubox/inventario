# Jombubox sales management

The private sales module records internal sales in MXN. It does not charge customers, process platform refunds, purchase shipping labels, create customer accounts or issue CFDI invoices. Public quotations remain WhatsApp contacts with no sales or stock side effects.

## Application

- `/admin/ventas`: metrics, newest-first history, 20-row pagination, search, date/status/payment/delivery/method filters and reports.
- `/admin/ventas/nueva`: five sections, backward navigation without losing form data, source-level stock search, customer and delivery snapshots, explicit discounts/tax, payment and final confirmation.
- `/admin/ventas/[id]`: immutable items/prices, exact source snapshots, payments/balances, fulfillment updates, cancellations, partial returns, refund records and audit timeline.
- `/admin/ventas/[id]/recibo`: authenticated commercial receipt with browser printing and Save as PDF. Clearly identifies itself as **not a CFDI**.
- `/api/admin/sales`, `/api/admin/sales/[id]`, `/api/admin/sales/stock`, `/api/admin/sales/export`: signed server-side administrator authorization on every request. Export supports `report=true` and the same filters.

The existing sidebar, mobile navigation, semantic color tokens, cards, inputs, buttons and modal are reused. Public desktop/mobile links to `/admin` have been removed for every visitor, including authenticated admins. Direct `/admin` and `/login` continue working.

## Database and historical records

`0009_sales_management.sql` adds seven tables, foreign keys with RESTRICT deletion, checks and lookup indexes. `0010_sales_history_guards.sql` adds functions/triggers only on the new tables. No existing table, enum, historical row, SKU, image, auth identity or sequence is rewritten.

| Table | Purpose |
| --- | --- |
| `sales` | Unique UUID-derived folio and creation idempotency key/hash; customer/delivery snapshots; integer centavo totals, credits and lifecycle timestamps |
| `sale_items` | Product FK plus immutable SKU/title/brand/part/condition/warranty/price snapshot |
| `sale_allocations` | Exact existing inventory source, quantity, original location/box/bag/condition snapshot, SALE movement FK and monotonic returned quantity |
| `sale_payments` | Positive PAYMENT/REFUND records, method, actual occurrence date, reference and notes |
| `sale_returns` | Return/cancellation reason, inspected condition and explicit financial credit |
| `sale_return_items` | Allocation-level returned quantity, stock disposition, destination entry and compensating RETURN movement |
| `sale_events` | Append-only per-sale timeline and operation idempotency key/hash |

Customers are one-time snapshots, not a reusable directory: this avoids duplicate profiles and unnecessary personal-data collection. No customer registration is required. Name/phone/email are optional for pickup/personal delivery; shipping requires recipient, Mexican phone and address. Email is never mandatory.

Runtime authentication uses the existing environment-authenticated administrator, not the retained legacy UUID user table. Events use `actor = ADMIN`; existing movement `user_id` stays null. No fabricated UUID identity is inserted.

## Transaction and concurrency model

Every creation, completion, payment, return, cancellation and fulfillment change executes in a PostgreSQL transaction. Drafts do not deduct or reserve stock. Completion locks source rows in stable UUID order, checks products/catalog eligibility, physical source ownership/availability, active location ancestry and quantities, then calls the existing `recordStockMovementInTransaction` service. Quantities and zero-stock SOLD status use the established inventory rules. The SALE movement and its exact allocation reference commit with the completed sale, snapshots and audit event.

The inventory service change is an optional sales metadata argument and returned movement ID. Existing callers and movement types continue working. A failed movement/audit insert rolls back the entire sale and any initial payment. Competing sales cannot oversell a locked source. Every subsequent mutation locks the sale before validating monetary/return limits, serializing competing returns and payments.

Creation keys are unique. Action keys are unique per sale. The normalized payload hash prevents using an old key for different data. Simultaneous retries converge on one committed operation. The client keeps ambiguous requests unchanged for safe retry and disables competing submission; it does not automatically turn an uncertain response into a new sale.

Draft quantities/prices are saved; completing revalidates live eligibility and sources. A moved/changed source requires a fresh draft. Saved drafts are completed or cancelled; this version does not reopen them for financial editing. Product/source identity and historical financial fields cannot be silently changed; database triggers also reject history updates/deletes.

## Money, payments and reports

Money is integer MXN centavos with strict decimal input parsing. No tax rate or acquisition cost is invented. The unit price defaults to the current product price and an authenticated admin may override it. Line discounts are **total discounts for that line**, not discounts per unit. One sale is limited to 2,000,000,000 centavos (MXN 20,000,000), 50 lines and a bounded 64 KB request.

```
total = quantity × unit price − line discounts − order discount + shipping + explicit tax
obligation = total − credits
net collected = successful recorded payments − recorded refunds
outstanding = max(0, obligation − net collected)
refund due = max(0, net collected − obligation)
```

A return credit reduces the obligation once. A refund records money actually given back and reduces cash collected once. Cancellation credits the remaining obligation but does not refund money automatically. New payments cannot exceed outstanding; refunds cannot exceed the current refund due. Multiple partial payments/refunds are supported. No payment can be added to a draft or cancelled sale; a cancelled sale can retain a refund due until actually refunded.

History filters use sale creation dates in `America/Mexico_City`. Report periods group those sales by completion date and show their **current** credits; these are cohort reports, not historical period-closing accounting statements. Gross totals include completed sales later cancelled. Net sales subtract credits/cancellations. Collected revenue is payments less refunds against that filtered set of sales, independent of payment date. Drafts are excluded from revenue and receivable aggregates. Payment methods and delivery totals are separate. Reports include daily/monthly totals, quantities, top 20 products by units less returns, cancellations, returns/refunds and CSV exports. Recent period rows are bounded to 366 days/120 months; sale CSV exports require a narrower filter beyond 10,000 sales. No gross-margin report is inferred from unreliable cost coverage.

## Returns, cancellation and archival

Returns are bounded by sold quantity less previous returns. Each selected allocation specifies:

- **SELLABLE:** restore the existing source when safe. If its current status is reserved/damaged/scrapped, create a separate AVAILABLE return entry; never reclassify existing non-sellable quantities.
- **DAMAGED:** create a separate DAMAGED inventory entry with an auditable RETURN movement. Never increase sellable stock.
- **NONE:** record the return/credit without stock movement because nothing was physically received.

Cancellation requires confirmation/reason and restores only remaining, unreturned quantities through RETURN movements. Original SALE movements are retained. Previously returned quantities of every disposition are excluded from cancellation restocking. Money refunds remain a separate confirmed operation.

An archived/deleted product or inactive location cannot be sold. Physical restocking also requires restoring the product/location first through the existing archival workflow; an unsafe restock fails atomically with no partial cancellation. Historical snapshots remain visible when products/prices/warranties/locations later change. Foreign keys prevent deletion of products/stock/movements referenced by history. Archival is still allowed.

## Security and verification

Mutations enforce signed admin authentication, same-origin checks, strict Zod schemas, bounded streamed JSON bodies and transaction-time business validation. No customer rows are returned through public catalog endpoints. Sales responses/exports are private and no-store. Errors log only a fixed event/error class, without SQL values, customer phone/address or request payloads. React escapes text, and CSV cells neutralize formula prefixes, including whitespace-prefixed formulas, and quote/escape data.

Run the local harness with explicit disposable resources. It never falls back to `.env.local` database credentials:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54331/jumbobox_test'
pnpm sales:verify migrate
pnpm sales:verify test
pnpm sales:verify e2e
pnpm sales:verify lint
pnpm sales:verify typecheck
pnpm sales:verify build
pnpm audit --prod --audit-level high
```

PostgreSQL must be a disposable local `jumbobox_test`. E2E resets it and uses the existing local fake R2 and Neon WebSocket proxy. Stop a stale proxy pointing to a different PostgreSQL port before changing ports. The new integration files are also included in `test:integration` and the existing CI `pnpm test` discovers them.

See [production release plan](sales-production-release.md) for migration fingerprints, safety gates, backup validation, execution, deployment and recovery. No production mutation or deployment is authorized by these documents.
