import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";

const credentials = {
  ADMIN: { email: "admin@e2e.local", password: "JombuBox-E2E-Admin-123!" },
  EDITOR: { email: "editor@e2e.local", password: "JombuBox-E2E-Editor-123!" },
  VIEWER: { email: "viewer@e2e.local", password: "JombuBox-E2E-Viewer-123!" },
} as const;

async function login(page: Page, role: keyof typeof credentials) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(credentials[role].email);
  await page.getByLabel("Contraseña").fill(credentials[role].password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
}

test("unauthenticated admin access redirects to login", async ({ page }) => {
  await page.goto("/admin/inventario");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Finventario/u);
});

test("VIEWER sees read-only UI and cannot bypass permissions", async ({ page }) => {
  await login(page, "VIEWER");
  await expect(page.getByRole("link", { name: "Nuevo producto" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Auditoría" })).toHaveCount(0);

  await page.goto("/admin/inventario");
  await expect(page.getByRole("link", { name: "Exportar inventario" })).toHaveCount(0);
  const exportResponse = await page.request.get("/api/exports/inventory");
  expect(exportResponse.status()).toBe(403);

  await page.goto("/admin/usuarios");
  await expect(page).toHaveURL(/\/admin\/forbidden/u);
});

test("EDITOR exports inventory and completes the legacy import workflow", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name.startsWith("mobile"), "State-changing workflow runs once against the shared E2E database.");
  await login(page, "EDITOR");
  const exportResponse = await page.request.get("/api/exports/inventory");
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["content-disposition"]).toContain("JombuBox_Inventario_");

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventario");
  sheet.addRow(["LegacyBagNumber", "Brand", "CompatibleModel", "ComponentType", "PartNumber", "Quantity", "AcquisitionSource"]);
  sheet.addRow(["E2E-77", "HISSENSE", "50H5G", "T-COM", "RSAG7.820.E2E", 1, "Compra E2E"]);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const fixturePath = testInfo.outputPath("legacy-e2e.xlsx");
  await writeFile(fixturePath, bytes);

  const defaults = { condition: "UNKNOWN", inventoryStatus: "AVAILABLE", currency: "MXN", isPublic: false };
  const previewResponse = await page.request.post("/api/imports/analyze", {
    headers: { Origin: "http://127.0.0.1:3000" },
    multipart: { file: createReadStream(fixturePath), options: JSON.stringify({ defaults }) },
  });
  const previewText = await previewResponse.text();
  expect(previewResponse.status(), previewText).toBe(200);
  const preview = JSON.parse(previewText);
  expect(preview.summary.totalRows).toBe(1);
  const confirmResponse = await page.request.post("/api/imports/confirm", {
    headers: { Origin: "http://127.0.0.1:3000" },
    multipart: {
      file: createReadStream(fixturePath),
      options: JSON.stringify({
        jobId: preview.jobId,
        mapping: preview.mapping,
        defaults,
        corrections: {},
        forceDuplicateFile: false,
        includeDuplicateRows: false,
        includePreviouslyImported: false,
      }),
    },
  });
  const confirmText = await confirmResponse.text();
  expect(confirmResponse.status(), confirmText).toBe(200);
  await page.goto("/admin/importar");
  await expect(page.getByText("COMPLETED", { exact: true }).first()).toBeVisible();
});

test("EDITOR uploads an image through the server-side fake R2 boundary", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "State-changing workflow runs once against the shared E2E database.");
  await login(page, "EDITOR");
  await page.goto("/admin/productos");
  const editLink = page.getByRole("row").filter({ hasText: "Mainboard Samsung BN94-07820F" }).getByRole("link", { name: "Editar" });
  const editHref = await editLink.getAttribute("href");
  expect(editHref).toBeTruthy();
  const productId = editHref!.split("/").at(-1)!;
  const health = await page.request.get("http://127.0.0.1:5555/health");
  expect(health.ok()).toBe(true);
  const uploadResponse = await page.request.post("/api/products/images/upload", {
    headers: { Origin: "http://127.0.0.1:3000" },
    multipart: {
      productId,
      alt: "tiny",
      file: {
        name: "tiny.png",
        mimeType: "image/png",
        buffer: Buffer.from("89504e470d0a1a0a00000000", "hex"),
      },
    },
  });
  const uploadText = await uploadResponse.text();
  expect(uploadResponse.status(), uploadText).toBe(201);
  await page.goto(editHref!);
  await expect(page.getByLabel("Texto alternativo")).toHaveValue("tiny");
  await expect(page.getByText("Principal", { exact: true })).toBeVisible();
});

test("ADMIN completes product, stock, location, movement, image and publication", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  test.skip(testInfo.project.name.startsWith("mobile"), "The stateful acceptance flow runs once; responsive admin behavior is covered separately.");
  await login(page, "ADMIN");

  await page.goto("/admin/productos/nuevo");
  await page.getByLabel("Número de parte").fill("E2E-FULL-001");
  await page.getByLabel("Descripción").fill("Producto creado por el flujo integral E2E.");
  await page.getByLabel("Precio de venta").fill("999.90");
  await page.getByRole("button", { name: "Crear producto" }).click();
  await expect(page).toHaveURL(/\/admin\/productos\/[0-9a-f-]+\?notice=created/u, { timeout: 20_000 });
  const editUrl = page.url();
  const productId = new URL(editUrl).pathname.split("/").at(-1)!;
  const title = await page.getByLabel("Título administrativo").inputValue();
  expect(title).toContain("E2E-FULL-001");

  await page.goto("/admin/inventario");
  await page.getByText("Agregar existencia física", { exact: true }).click();
  const createInventory = page.locator("details").filter({ hasText: "Agregar existencia física" }).locator("form");
  const productOption = createInventory.getByLabel("Producto", { exact: true }).locator("option").filter({ hasText: "E2E-FULL-001" });
  await createInventory.getByLabel("Producto", { exact: true }).selectOption((await productOption.getAttribute("value"))!);
  await createInventory.getByLabel("Cantidad inicial").fill("2");
  await createInventory.getByLabel("Condición", { exact: true }).selectOption("NEW");
  await createInventory.getByRole("button", { name: "Crear existencia" }).click();
  await expect(page.getByText(/Inventario INV-\d+ creado\./u)).toBeVisible({ timeout: 20_000 });

  await page.goto("/admin/ubicaciones");
  await page.locator("summary").filter({ hasText: "Crear ubicación" }).click();
  const createLocation = page.locator("details").filter({ hasText: "Crear ubicación" }).locator("form");
  await createLocation.getByLabel("Código", { exact: true }).fill("E2ELOC");
  await createLocation.getByLabel("Nombre", { exact: true }).fill("Ubicación integral E2E");
  await createLocation.getByRole("button", { name: "Crear ubicación" }).click();
  await expect(page.getByText("Ubicación creada.", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("article").filter({ hasText: "Ubicación integral E2E" }).first()).toBeVisible();

  await page.goto("/admin/inventario?q=E2E-FULL-001");
  let item = page.locator("article").filter({ hasText: "E2E-FULL-001" }).first();
  await item.getByText("Mover, ajustar o editar este registro", { exact: true }).click();
  const adjustment = item.locator("form").filter({ hasText: "Ajustar cantidad" });
  await adjustment.getByLabel("Nueva cantidad").fill("3");
  await adjustment.getByLabel("Motivo").fill("Conteo físico E2E");
  await adjustment.getByRole("button", { name: "Registrar ajuste" }).click();
  await expect(page.getByText("Cantidad ajustada.", { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.goto("/admin/inventario?q=E2E-FULL-001");
  item = page.locator("article").filter({ hasText: "E2E-FULL-001" }).first();
  await item.getByText("Mover, ajustar o editar este registro", { exact: true }).click();
  const move = item.locator("form").filter({ hasText: "Mover ubicación" });
  const locationOption = move.getByLabel("Destino").locator("option").filter({ hasText: "Ubicación integral E2E" });
  await move.getByLabel("Destino").selectOption((await locationOption.getAttribute("value"))!);
  await move.getByLabel("Motivo").fill("Asignación inicial E2E");
  page.once("dialog", (dialog) => dialog.accept());
  await move.getByRole("button", { name: "Mover inventario" }).click();
  await expect(page.getByText("Inventario movido.", { exact: true })).toBeVisible({ timeout: 20_000 });

  const uploadResponse = await page.request.post("/api/products/images/upload", {
    headers: { Origin: "http://127.0.0.1:3000" },
    multipart: {
      productId,
      alt: "Producto integral E2E",
      file: {
        name: "full-flow.png",
        mimeType: "image/png",
        buffer: Buffer.from("89504e470d0a1a0a00000000", "hex"),
      },
    },
  });
  expect(uploadResponse.status(), await uploadResponse.text()).toBe(201);

  await page.goto(editUrl);
  await page.getByLabel("Estado").selectOption("ACTIVE");
  await page.getByLabel("Visible en el catálogo público").check();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(/notice=updated/u, { timeout: 20_000 });
  await page.goto("/catalogo?q=E2E-FULL-001");
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.goto("/admin");
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login/u);
});
