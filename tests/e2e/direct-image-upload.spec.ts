import { goToQuickAddStep } from "./helpers/quick-add-wizard";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { testImage } from "./helpers/test-image";

const database = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
const local = database && ["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname === "/jumbobox_test";
test.skip(!local || Boolean(process.env.PLAYWRIGHT_BASE_URL), "Requires disposable local database and fake R2.");
test.beforeEach(async () => {
  if (!local) return;
  const pool = new Pool({ connectionString: database!.href });
  try { await pool.query("delete from operational_rate_limits where key in ('image-upload:admin', 'image-confirm:admin', 'image-mutation:admin')"); }
  finally { await pool.end(); }
});
async function login(page: Page) {
  await page.goto("/login"); await page.getByLabel("Correo electrónico").fill("admin@e2e.local");
  await page.getByLabel("Contraseña").fill("JombuBox-E2E-Admin-123!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click(); await expect(page).toHaveURL(/\/admin$/);
}
function image(size: number) { const bytes = Buffer.alloc(size); testImage().copy(bytes); return bytes; }

test("Quick Add sends 6 MiB and exact 10 MiB directly to R2; later photos survive a failure and retry restores order", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await login(page);
  const bodies: { path: string; size: number; type: string }[] = [], putSizes: number[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/products/images/") && request.method() === "POST") bodies.push({ path: new URL(request.url()).pathname, size: request.postDataBuffer()?.byteLength ?? 0, type: request.headers()["content-type"] ?? "" });
    if (request.method() === "PUT" && request.url().startsWith("http://127.0.0.1:5555/")) putSizes.push(request.postDataBuffer()?.byteLength ?? 0);
  });
  await page.locator("[data-quick-add-trigger]").filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
  const part = `DIRECT-${testInfo.project.name}`;
  await goToQuickAddStep(dialog, 2);
  await dialog.getByLabel("Número de parte", { exact: true }).fill(part);
  await goToQuickAddStep(dialog, 4);
  const picker = dialog.getByLabel(/Agregar fotos/);
  await picker.setInputFiles({ name: "too-big.png", mimeType: "image/png", buffer: image(10 * 1024 * 1024 + 1) });
  await expect(dialog.getByText("too-big.png supera el límite de 10 MB.", { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(0); expect(putSizes).toHaveLength(0);
  await picker.setInputFiles({ name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("invalid content") });
  await expect(dialog.getByText("La firma binaria no coincide con el tipo de imagen.")).toBeVisible();
  await picker.setInputFiles([
    { name: "six.png", mimeType: "image/png", buffer: image(6 * 1024 * 1024) },
    { name: "retry.png", mimeType: "image/png", buffer: testImage() },
    { name: "ten.png", mimeType: "image/png", buffer: image(10 * 1024 * 1024) },
  ]);
  let puts = 0;
  let releaseConfirmation!: () => void;
  const confirmationGate = new Promise<void>(resolve => { releaseConfirmation = resolve; });
  let confirmations = 0;
  await page.route("**/api/products/images/confirm", async route => {
    if (++confirmations === 1) await confirmationGate;
    await route.continue();
  });
  await page.route("http://127.0.0.1:5555/**", async route => {
    if (route.request().method() === "PUT" && ++puts === 2) await route.fulfill({ status: 503 });
    else await route.continue();
  });
  await goToQuickAddStep(dialog, 5);
  expect(bodies).toHaveLength(0); // No authorization or upload before the creation transaction.
  await goToQuickAddStep(dialog, 5);
  await dialog.getByRole("button", { name: "Agregar producto", exact: true }).click();
  await expect(dialog.locator('[data-photo-state="uploading"]').getByRole("status")).toContainText("99%", { timeout: 30_000 });
  await expect(dialog.getByRole("button", { name: "Cerrar", exact: true })).toBeDisabled();
  releaseConfirmation();
  await expect(dialog.getByText("El producto y el inventario sí se guardaron.")).toBeVisible({ timeout: 60_000 });
  await expect(dialog.locator('[data-photo-state="uploaded"]')).toHaveCount(2);
  await expect(dialog.locator('[data-photo-state="failed"]')).toHaveCount(1);
  await dialog.getByRole("button", { name: "Reintentar subida de retry.png", exact: true }).click();
  await expect(dialog.getByText("Las fotos se guardaron correctamente.")).toBeVisible({ timeout: 60_000 });
  await expect(dialog.locator('[data-photo-state="uploaded"]')).toHaveCount(3);
  expect(puts).toBe(4);
  expect(putSizes).toContain(6 * 1024 * 1024); expect(putSizes).toContain(10 * 1024 * 1024);
  expect(bodies.length).toBeGreaterThanOrEqual(7);
  expect(bodies.every(({ size, type }) => size < 8192 && type.startsWith("application/json"))).toBe(true);
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.goto(`/admin/productos?q=${part}`);
  const editHref = await page.getByRole("row").filter({ hasText: part }).getByRole("link", { name: "Editar" }).getAttribute("href");
  const productId = editHref!.split("/").at(-1)!;
  await page.goto(editHref!); await page.reload();
  await expect(page.getByLabel("Texto alternativo")).toHaveCount(3);
  expect(await page.getByLabel("Texto alternativo").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(["six", "retry", "ten"]);
  const review = await page.request.get(`/api/admin/products/${productId}/review`);
  expect((await review.json()).images).toHaveLength(3);
  // Product Edit uses the same transport, including the > Vercel-limit case.
  await page.getByLabel("Subir imágenes").setInputFiles({ name: "edit-six.png", mimeType: "image/png", buffer: image(6 * 1024 * 1024) });
  await expect(page.getByLabel("Texto alternativo")).toHaveCount(4, { timeout: 60_000 });
  await expect(page.getByLabel("Texto alternativo").last()).toHaveValue("edit-six");
  await page.getByRole("button", { name: "Hacer foto principal", exact: true }).last().click();
  await expect(page.getByLabel("Texto alternativo").first()).toHaveValue("edit-six");
  await page.getByLabel("Subir imágenes").setInputFiles({ name: "after-order.png", mimeType: "image/png", buffer: testImage() });
  await expect(page.getByLabel("Texto alternativo")).toHaveCount(5, { timeout: 30_000 });
  await page.reload();
  await expect(page.getByLabel("Texto alternativo").first()).toHaveValue("edit-six");
  await expect(page.getByLabel("Texto alternativo").last()).toHaveValue("after-order");
  expect(bodies.every(({ size, type }) => size < 8192 && type.startsWith("application/json"))).toBe(true);
});

test("direct authorization rejects anonymous, arbitrary keys, invalid tokens and expired PUTs; a signed PUT cannot overwrite a saved image", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const anonymous = await browser.newContext();
  for (const path of ["upload", "confirm"]) {
    const response = await anonymous.request.post(`http://127.0.0.1:3000/api/products/images/${path}`, { headers: { Origin: "http://127.0.0.1:3000" }, data: path === "confirm" ? { token: "invalid" } : {} });
    expect(response.status()).toBe(401);
  }
  await anonymous.close(); await login(page); await page.goto("/admin/productos");
  const editHref = await page.getByRole("link", { name: "Editar", exact: true }).first().getAttribute("href");
  const bytes = testImage(), productId = editHref!.split("/").at(-1)!;
  const input = { productId, uploadId: randomUUID(), batchId: randomUUID(), position: 0, filename: "secure.png", mimeType: "image/png", size: bytes.length,
    signatureHex: bytes.subarray(0, 12).toString("hex"), fingerprint: createHash("sha256").update(bytes).digest("hex") };
  const headers = { Origin: "http://127.0.0.1:3000" };
  expect((await page.request.post("/api/products/images/upload", { headers, data: { ...input, objectKey: "products/other/overwrite.png" } })).status()).toBe(400);
  const response = await page.request.post("/api/products/images/upload", { headers, data: input });
  expect(response.status()).toBe(200);
  const auth = await response.json();
  expect(new URL(auth.uploadUrl).pathname).toContain("/product-image-uploads/");
  const badUrl = new URL(auth.uploadUrl); badUrl.searchParams.set("X-Amz-Signature", "0".repeat(64));
  expect((await page.request.put(badUrl.href, { headers: auth.headers, data: bytes })).status()).toBe(403);
  expect((await page.request.put(auth.uploadUrl, { headers: { "Content-Type": "image/jpeg" }, data: bytes })).status()).toBe(403);
  const localClient = new S3Client({ region: "auto", endpoint: "http://127.0.0.1:5555", forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: { accessKeyId: "e2e-access-key", secretAccessKey: "e2e-secret-key" } });
  const expiredUrl = await getSignedUrl(localClient, new PutObjectCommand({ Bucket: "jombubox-e2e", Key: "product-image-uploads/expired.png", ContentType: "image/png" }),
    { expiresIn: 300, signingDate: new Date(Date.now() - 600_000), signableHeaders: new Set(["content-type"]) });
  expect((await page.request.put(expiredUrl, { headers: { "Content-Type": "image/png" }, data: bytes })).status()).toBe(403);
  localClient.destroy();
  expect((await page.request.post("/api/products/images/confirm", { headers, data: { token: "invalid" } })).status()).toBe(400);
  const expiredClaims = { ...input, expiresAt: Math.floor(Date.now() / 1000) - 1 };
  const payload = Buffer.from(JSON.stringify(expiredClaims)).toString("base64url");
  const digest = createHmac("sha256", "e2e-secret-key").update(`jumbobox-image-upload-v1:${payload}`).digest("base64url");
  expect((await page.request.post("/api/products/images/confirm", { headers, data: { token: `${payload}.${digest}` } })).status()).toBe(400);
  expect((await page.request.put(auth.uploadUrl, { headers: auth.headers, data: bytes })).status()).toBe(200);
  const confirmation = await page.request.post("/api/products/images/confirm", { headers, data: { token: auth.token } });
  expect(confirmation.status()).toBe(201); const saved = (await confirmation.json()).image;
  expect(saved.storageKey).toMatch(/^products\//u);
  expect((await page.request.post("/api/products/images/confirm", { headers, data: { token: auth.token } })).status()).toBe(201);
  // Reusing the still-valid PUT only recreates a temporary object; the final bytes stay intact.
  expect((await page.request.put(auth.uploadUrl, { headers: auth.headers, data: Buffer.from("changed") })).status()).toBe(200);
  const final = await page.request.get(`http://127.0.0.1:5555/jombubox-e2e/${saved.storageKey}`);
  expect(await final.body()).toEqual(bytes);
  const replay = await page.request.post("/api/products/images/upload", { headers, data: input });
  expect((await replay.json()).image.id).toBe(saved.id);
  await page.request.delete(`/api/products/images/${saved.id}`, { headers });
  await page.request.delete(auth.uploadUrl);
});
