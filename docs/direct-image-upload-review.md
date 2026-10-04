# Direct R2 image upload candidate

Implementation review, October 3, 2026. This extends the previously validated theme/image/search working tree. No Vercel deployment, production DB operation, production R2 request/configuration change, staging change, DNS change or production-secret change was performed. Tests use local disposable PostgreSQL, a Neon WebSocket proxy and a signature-verifying fake R2.

1. **Old path:** `PhotoSelection` → `usePhotoUploads` → multipart POST `/api/products/images/upload` → `request.formData()`/`file.arrayBuffer()` → `createProductImage` → AWS S3 `PutObject` to R2 → transactional image registration. Both Quick Add and Product Edit sent all file bytes through the application request body.
2. **Vercel failure:** the platform rejects function request bodies above 4.5 MB before application validation. A 6 MiB or 10 MiB image therefore failed despite the application allowing it. [Vercel request-body limit](https://vercel.com/docs/functions/limitations#request-body-size).
3. **New architecture:** product/inventory creation succeeds first. The browser POSTs a small JSON description to `/api/products/images/upload`, PUTs the file directly to the R2 S3 endpoint, and POSTs only a signed token to `/api/products/images/confirm`. Confirmation verifies and copies the temporary object within R2, then uses the existing image service to register the final key and revalidate views. The application never accepts an image-byte request body.
4. **Authorization:** both endpoints require the existing admin session, same-origin mutation checks and operational rate limits. Presigned PUTs expire after five minutes and sign the exact content type. A separate, purpose-bound HMAC confirmation token signs product ID, selection ID, batch/order, name, type, size, signature, fingerprint, alt and expiry. JSON parsing is bounded to 8 KiB even without `Content-Length`. Responses are private/no-store. As explicitly agreed in this session, standard SigV4 URLs include the non-secret access-key identifier in `X-Amz-Credential`; the secret key and reusable credential configuration remain server-only. [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
5. **Object-key security:** arbitrary keys/extra fields are rejected. Temporary keys use `product-image-uploads/<product-id>/<selection-id>-<server-HMAC>.<ext>`. Final keys retain `products/<sanitized-sku>/<uuid>.<ext>`, with the UUID derived using a separate server HMAC. The browser cannot choose a final key or obtain a PUT URL for an existing image. Reusing a still-valid PUT only changes the temporary object. Cross-product selection-ID reuse is rejected against existing DB records. Temporary deletion and final deletion have separate namespace assertions.
6. **Post-upload verification:** HEAD checks existence, exact claimed length, exact content type and ETag. A bounded conditional GET verifies the actual byte length, SHA-256 and existing PNG/JPEG/WebP binary-signature policy. A conditional R2 CopyObject uses that same ETag, preventing a changed object from being copied after verification. These bytes are read server-to-server from R2; they are not browser-to-Vercel request bodies. Only verified final objects receive a DB association. [R2 supported conditional operations](https://developers.cloudflare.com/r2/api/s3/api/).
7. **10 MiB:** unchanged (`10 * 1024 * 1024`). Client selection and transport reject larger files; authorization validates declared size and confirmation verifies actual size, including malicious declarations. Bounded object reading prevents unbounded allocation.
8. **MIME:** JPEG, PNG and WebP remain supported. Name/extension/MIME/signature validation is preserved on selection and repeated against actual uploaded bytes on the server. Spanish validation messages remain. No SVG or unsupported type is added.
9. **Retry:** stable selection IDs, temporary keys and content fingerprints prevent duplicate objects/records. A successful confirmation with a lost response returns the existing image on retry without another PUT. A lost PUT response can be retried to the same temporary key. Changed content for a registered selection is rejected. Successful photos are skipped; failed photos alone are retried. Later photos continue after an individual failure.
10. **Cleanup:** authorization alone creates no permanent record/object. Confirmation always attempts temporary-prefix cleanup; failed registration uses the existing locked rollback cleanup to delete an unregistered final copy while preserving registered images. Cleanup failures are logged without hiding a successful registration. Browser abandonment, failed PUT responses and reuse of an unexpired URL can leave temporary objects, requiring the one-day prefix lifecycle rule below. Final `products/` objects are never subject to that rule. No aggressive bucket-wide sweep is added.
11. **Quick Add:** existing steps, previews, remove-before-save, validation, safe product/inventory transaction, selected ordering and primary controls remain. Per-photo states and retry remain, with actual XHR upload percentages followed by server confirmation. No authorization/PUT occurs before creation succeeds. A failed photo retains the valid product/inventory and other successful photos.
12. **Product Edit:** uses the same hook and direct transport. Existing add/remove/alt/primary/reorder controls, queue isolation and refresh behavior remain. A new completed selection starts a new upload batch so later additions do not undo manual ordering of older images.
13. **Primary/order:** the existing `sortOrder`/`isPrimary` model and unique-primary constraint remain. New-batch position metadata lets a retried earlier photo join its selected position after later photos succeed. Transactions still enforce contiguous order and exactly one primary at position zero. Existing images and primary/table/catalog/gallery readers are unchanged. Existing safe deletion remains.
14. **CORS:** required before deployment. The reviewed additive rule is in `r2-direct-upload-cors.json`: the two production aliases recorded in the prior release, PUT only, `Content-Type` only, preflight cache 300 seconds. No wildcard origins, credentials or unnecessary exposed headers. Preserve any existing GET/HEAD CORS rules needed by other consumers when merging this new rule. Verify actual current origins before applying; immutable/preview deployments are intentionally excluded. CSP now permits the exact configured R2 account endpoint for connections, without broadening production `connect-src` to all hosts. [Cloudflare browser-upload CORS](https://developers.cloudflare.com/r2/buckets/cors/).
15. **Migration:** no schema migration generated. Existing JSON metadata stores batch/order alongside the existing fingerprint. This session created a fresh local disposable database and applied the repository's existing migrations solely to that fixture.
16. **6 MiB result:** passed on desktop and mobile. Browser regression asserts a 6 MiB decodable PNG travels in a PUT to fake R2, while every application upload/confirmation request is JSON below 8 KiB; checks DB association and reload in Quick Add and Product Edit.
17. **Exact 10 MiB result:** passed on desktop and mobile. Same browser regression uploads a decodable PNG at exactly 10 MiB, registers it and checks order after reload.
18. **Above 10 MiB result:** passed on desktop and mobile. Browser rejects 10 MiB + 1 before any authorization or PUT. Route/service tests also reject dishonest size/content/type/signature declarations.
19. **Unit:** `pnpm test` passed: 175 tests, 37 files. The 39 integration cases are skipped by this command and run separately.
20. **Integration:** 39 tests passed across two files against disposable PostgreSQL; final run repeated after the server-derived final-key change. Covers authorization without association, actual R2 verification, concurrent confirmation, product/content ownership, DB/audit rollback plus safe storage cleanup and retry, and selected order after a partial failure.
21. **Desktop/mobile E2E:** full suite passed, 46 passed and 12 existing remote/staging/duplicate-workflow skips, zero failures. Desktop: 26 passed, three skipped; mobile: 20 passed, nine skipped. All four new direct-upload/security cases executed. Existing theme/search, Quick Add, Product Edit, image ordering/primary, admin modal, desktop zoom, touch viewer and public gallery regressions passed alongside the new cases. The final focused rerun passed all four direct cases after the response-order correction; it additionally verifies visible 99% upload progress while confirmation is pending, blocked closing during upload, and preservation of a manually selected primary when another photo is added in the same edit session. An initial new-test run timed out on an incorrect close-button selector after the upload assertions passed; the selector was corrected and the full rerun passed. No force clicks were used.
22. **Lint:** `pnpm lint` passed, exit 0, no lint warnings.
23. **Typecheck:** `pnpm typecheck` passed, exit 0.
24. **Build:** `pnpm build` passed, exit 0. The existing middleware deprecation remains; the stopped local fixture server produced an Open Graph logo fetch warning. Neither failed the build. Production R2 connectivity was not exercised.
25. **Diff check:** `git diff --check` passed. The full candidate contains 63 source/test/doc/dependency files, including the earlier validated working-tree changes. No secret/temp path candidates or private-key/token patterns were found in those files. The built browser assets contain no R2 environment-variable names or local fixture secret key.
26. **Files changed for this follow-up:** manifest below. Earlier palette/search changes remain in the working tree for review. One matching-version AWS presigner dependency was added; Smithy dependencies were aligned to compatible versions to avoid duplicate SDK client/type instances. No hosting-provider or DB schema replacement.
27. **Production deployment steps:** documented below for a future authorized promotion; none executed here.
28. **Limits:** local fake R2 verifies SigV4, expiration, signed MIME headers, ETag reads/copies and CORS, but does not establish real production bucket connectivity/policy behavior. Real-browser CORS smoke testing remains a release prerequisite. Server-side SHA-256 verification reads up to 10 MiB from R2 per photo and adds latency/egress; R2 copies remain inside storage. Abandoned temporary objects persist until lifecycle cleanup. Upload/confirmation expire after five minutes; a slow connection gets fresh authorization on retry. Mobile tests use Chromium emulation, not physical Safari. Standard presigned URLs are bearer capabilities: do not log or share them.

## Future production steps — not executed

1. Review this working-tree candidate and the prior theme/image/search report. Run required checks and commit the exact candidate; record its SHA and previous Vercel deployment for rollback.
2. Confirm Vercel project `inventario`, scope `jombubox1`, and the current production aliases. Keep the existing R2 bucket, public URL, DB connection, DNS and server secrets. Existing R2 Object Read & Write access must support HEAD/GET/PUT/COPY/DELETE. Do not expose any secret as `NEXT_PUBLIC_*`.
3. Export/read the current bucket CORS policy, merge the rule from `docs/r2-direct-upload-cors.json`, and review the result before applying. Wrangler's CORS set operation replaces the complete policy; do not replace existing rules blindly. Apply the reviewed merged file only in the correct production account/bucket:

   ```powershell
   pnpm.cmd exec wrangler r2 bucket cors set <EXISTING_PRODUCTION_BUCKET> --file <REVIEWED_MERGED_CORS_FILE>
   ```

4. Preserve current lifecycle rules and add only this temporary-prefix rule:

   ```powershell
   pnpm.cmd exec wrangler r2 bucket lifecycle add <EXISTING_PRODUCTION_BUCKET> jumbobox-temporary-image-uploads product-image-uploads/ --expire-days 1
   ```

   Confirm it is enabled and scoped exactly to `product-image-uploads/`, never `products/` or the entire bucket. [R2 lifecycle configuration](https://developers.cloudflare.com/r2/buckets/object-lifecycles/), [Wrangler commands](https://developers.cloudflare.com/r2/reference/wrangler-commands/).
5. Build/deploy the reviewed commit to the existing Vercel project using existing production environment variables. `CLOUDFLARE_ACCOUNT_ID` must be available at build time so the exact R2 S3 origin enters CSP. No new environment variable or schema migration is required. Do not run production seed/migration commands. From the clean checkout of the reviewed release commit, verify the existing `.vercel/project.json` link and use the pinned Vercel CLI (a global executable is not present in this workspace session):

   ```powershell
   git status --short
   git diff --check
   git rev-parse HEAD
   pnpm.cmd dlx vercel@62.2.0 project inspect inventario --scope jombubox1
   pnpm.cmd dlx vercel@62.2.0 deploy --prod --scope jombubox1
   ```

   The first command must show no release-source changes; the recorded HEAD must equal the reviewed release SHA. The inspected project and local link must both identify the existing `inventario` project under `jombubox1`. The Vercel deployment builds that checkout using the project's production environment; do not upload the local fixture build as a prebuilt production deployment. [Vercel deploy command](https://vercel.com/docs/cli/deploy).
6. Record new deployment ID, immutable URL, assigned aliases and rollback deployment. Open production admin from an allowed origin and smoke-test direct PUT/CORS using a legitimate product/photo where authorized. Inspect network requests to confirm small application JSON requests and R2 PUTs for 6 MiB/exact 10 MiB, failed-photo retry, order/primary, thumbnails/gallery, zoom and existing-image loading. Check relevant application/R2 logs without recording signed URLs or secrets. Prefer read-only smoke checks until a legitimate upload is available.
7. If promotion fails, restore the previous Vercel deployment. Keep the additive CORS/lifecycle rules unless rollback review identifies a problem; the lifecycle cannot delete saved `products/` images. Preserve and inspect any `deletionPending` records using the existing recovery procedure.

## Evidence

Durable logs are outside the working tree at `C:/Users/yo/Desktop/work/JumboBox-releases/local-direct-upload/`: `unit-final.log`, `integration-final.log`, `e2e-full.log`, `e2e-final-focused.log`, `lint-final.log`, `types-final.log`, and `build-final.log`. The earlier exploratory browser result is retained as `e2e-first.log`. Local schema initialization and fixtures have separate logs. Theme screenshots are retained under `visual-final/` (32 desktop-size and 16 mobile-size originals, plus Playwright attachment copies). The 58-case full run is recorded in `e2e-full.log`; Playwright's ignored local HTML report shows the latest four-case focused run.

## Follow-up manifest

- `package.json`
- `pnpm-lock.yaml`
- `next.config.ts`
- `src/app/api/products/images/upload/route.ts`
- `src/app/api/products/images/upload/route.test.ts`
- `src/app/api/products/images/confirm/route.ts`
- `src/features/images/server/r2.ts`
- `src/features/images/server/direct-upload-service.ts`
- `src/features/images/server/upload-authorization.ts`
- `src/features/images/server/upload-authorization.test.ts`
- `src/features/images/server/image-json-request.ts`
- `src/features/images/server/image-service.ts`
- `src/features/images/components/direct-image-upload.ts`
- `src/features/images/components/use-photo-uploads.ts`
- `src/features/images/components/photo-selection.tsx`
- `src/validators/image.ts`
- `src/features/admin/server/admin-services.integration.test.ts`
- `src/scripts/fake-r2.mjs`
- `tests/e2e/admin-security.spec.ts`
- `tests/e2e/theme-images-search.spec.ts`
- `tests/e2e/direct-image-upload.spec.ts`
- `tests/e2e/helpers/direct-upload.ts`
- `docs/r2-direct-upload-cors.json`
- `docs/images.md`
- `docs/direct-image-upload-review.md`
- `docs/theme-images-search-review.md`
