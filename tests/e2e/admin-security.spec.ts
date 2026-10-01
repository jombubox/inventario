import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";

const credentials = {
  email: "admin@e2e.local",
  password: "JombuBox-E2E-Admin-123!",
} as const;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(credentials.email);
  await page.getByLabel("Contraseña").fill(credentials.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
}

function currentOrigin(page: Page): string {
  return new URL(page.url()).origin;
}

async function ensureTheme(page: Page, theme: "light" | "dark") {
  const root = page.locator("html");
  if (await root.getAttribute("data-theme") !== theme) {
    await page
      .getByRole("button", {
        name: theme === "dark" ? "Cambiar a modo oscuro" : "Cambiar a modo claro",
      })
      .click();
  }
  await expect(root).toHaveAttribute("data-theme", theme);
}

test("unauthenticated admin access redirects to login", async ({ page }) => {
  await page.goto("/admin/inventario");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Finventario/u);
});

test("wrong email and password do not create an admin session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("wrong@e2e.local");
  await page.getByLabel("Contraseña").fill(credentials.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(
    page.getByText("Correo o contraseña incorrectos.", { exact: true }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin/u);

  await page.getByLabel("Correo electrónico").fill(credentials.email);
  await page.getByLabel("Contraseña").fill("wrong-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(
    page.getByText("Correo o contraseña incorrectos.", { exact: true }),
  ).toBeVisible();

  const exportResponse = await page.request.get("/api/exports/inventory");
  expect(exportResponse.status()).toBe(401);
});

test("the administrator exports inventory and completes the legacy import workflow", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name.startsWith("mobile"), "State-changing workflow runs once against the shared E2E database.");
  await login(page);
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
    headers: { Origin: currentOrigin(page) },
    multipart: { file: createReadStream(fixturePath), options: JSON.stringify({ defaults }) },
  });
  const previewText = await previewResponse.text();
  expect(previewResponse.status(), previewText).toBe(200);
  const preview = JSON.parse(previewText);
  expect(preview.summary.totalRows).toBe(1);
  const confirmResponse = await page.request.post("/api/imports/confirm", {
    headers: { Origin: currentOrigin(page) },
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
  await expect(page.getByText("Completado", { exact: true }).first()).toBeVisible();
});

test("the administrator uploads an image through the server-side fake R2 boundary", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name.startsWith("mobile"), "State-changing workflow runs once against the shared E2E database.");
  const jsonSyntaxErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Unexpected token|is not valid JSON/iu.test(message.text())
    ) {
      jsonSyntaxErrors.push(message.text());
    }
  });
  await login(page);
  await page.goto("/admin/productos");
  const editLink = page.getByRole("row").filter({ hasText: "Mainboard Samsung BN94-07820F" }).getByRole("link", { name: "Editar" });
  const editHref = await editLink.getAttribute("href");
  expect(editHref).toBeTruthy();
  const productId = editHref!.split("/").at(-1)!;
  const health = await page.request.get("http://127.0.0.1:5555/health");
  expect(health.ok()).toBe(true);
  const uploadResponse = await page.request.post("/api/products/images/upload", {
    headers: { Origin: currentOrigin(page) },
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

  const secondUpload = await page.request.post("/api/products/images/upload", {
    headers: { Origin: currentOrigin(page) },
    multipart: {
      productId,
      alt: "second",
      file: {
        name: "second.webp",
        mimeType: "image/webp",
        buffer: Buffer.from("524946460000000057454250", "hex"),
      },
    },
  });
  expect(secondUpload.status(), await secondUpload.text()).toBe(201);

  const largePng = Buffer.alloc(10 * 1024 * 1024);
  Buffer.from("89504e470d0a1a0a00000000", "hex").copy(largePng);
  const largeUpload = await page.request.post("/api/products/images/upload", {
    headers: { Origin: currentOrigin(page) },
    multipart: {
      productId,
      alt: "large-valid",
      file: { name: "large.png", mimeType: "image/png", buffer: largePng },
    },
  });
  expect(largeUpload.status(), await largeUpload.text()).toBe(201);

  const invalidUpload = await page.request.post("/api/products/images/upload", {
    headers: { Origin: currentOrigin(page) },
    multipart: {
      productId,
      alt: "invalid",
      file: { name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") },
    },
  });
  expect(invalidUpload.status()).toBe(400);
  expect(invalidUpload.headers()["content-type"]).toContain("application/json");
  await expect(invalidUpload.json()).resolves.toMatchObject({ code: "INVALID_IMAGE" });

  const tooLargePng = Buffer.alloc(10 * 1024 * 1024 + 1);
  Buffer.from("89504e470d0a1a0a00000000", "hex").copy(tooLargePng);
  const tooLargeUpload = await page.request.post("/api/products/images/upload", {
    headers: { Origin: currentOrigin(page) },
    multipart: {
      productId,
      alt: "too-large",
      file: { name: "too-large.png", mimeType: "image/png", buffer: tooLargePng },
    },
  });
  expect(tooLargeUpload.status()).toBe(413);
  expect(tooLargeUpload.headers()["content-type"]).toContain("application/json");
  await expect(tooLargeUpload.json()).resolves.toMatchObject({ code: "IMAGE_TOO_LARGE" });

  await page.reload();
  await expect(page.getByLabel("Texto alternativo")).toHaveCount(3);
  await expect(page.getByLabel("Texto alternativo").nth(1)).toHaveValue("second");
  await expect(page.getByLabel("Texto alternativo").nth(2)).toHaveValue("large-valid");

  await ensureTheme(page, "dark");
  const imageInput = page.getByLabel("Subir imágenes");
  await imageInput.setInputFiles({
    name: "too-large-ui.png",
    mimeType: "image/png",
    buffer: tooLargePng,
  });
  await expect(
    page.getByText("too-large-ui.png supera 10 MB.", { exact: true }),
  ).toBeVisible();

  await imageInput.setInputFiles({
    name: "invalid-ui.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(
    page.getByText("invalid-ui.txt no es JPEG, PNG ni WEBP.", { exact: true }),
  ).toBeVisible();

  let interceptedProxyErrors = 0;
  await page.route("**/api/products/images/upload", async (route) => {
    interceptedProxyErrors += 1;
    const html = interceptedProxyErrors === 2;
    await route.fulfill({
      status: 413,
      contentType: html ? "text/html" : "text/plain",
      body: html
        ? "<html><body>Request Entity Too Large</body></html>"
        : "Request Entity Too Large",
    });
  });
  const proxyTestImage = Buffer.from("89504e470d0a1a0a00000000", "hex");
  for (const name of ["proxy-text.png", "proxy-html.png"]) {
    await imageInput.setInputFiles({
      name,
      mimeType: "image/png",
      buffer: proxyTestImage,
    });
    await expect(
      page.getByText(
        "La imagen es demasiado grande para el servidor. El máximo permitido es 10 MB.",
        { exact: true },
      ),
    ).toBeVisible();
  }
  await page.unroute("**/api/products/images/upload");

  expect(interceptedProxyErrors).toBe(2);
  expect(jsonSyntaxErrors).toEqual([]);
  await expect(page.getByText("Request Entity Too Large", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Unexpected token/iu)).toHaveCount(0);
  await expect(page.getByLabel("Texto alternativo")).toHaveCount(3);
});

test("the administrator creates and edits a product with custom catalogs", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name.startsWith("mobile"), "State-changing workflow runs once against the shared E2E database.");
  await login(page);
  await page.goto("/admin/productos/nuevo");
  await ensureTheme(page, "light");

  const samsungId = await page
    .getByLabel("Marca", { exact: true })
    .locator("option")
    .filter({ hasText: "Samsung" })
    .getAttribute("value");
  expect(samsungId).toBeTruthy();
  await page.getByLabel("Marca", { exact: true }).selectOption(samsungId!);
  await expect(page.getByLabel("Marca", { exact: true })).toHaveValue(samsungId!);
  await page.getByLabel("Marca", { exact: true }).selectOption("__custom__");
  await page.getByLabel("Nombre de la nueva marca").fill("Valor temporal");
  await page.getByLabel("Marca", { exact: true }).selectOption(samsungId!);
  await expect(page.getByLabel("Nombre de la nueva marca")).toHaveCount(0);
  await ensureTheme(page, "dark");
  await page.getByLabel("Marca", { exact: true }).selectOption("__custom__");
  await page.getByLabel("Nombre de la nueva marca").fill("Marca E2E personalizada");
  await page.getByLabel("Tipo de pieza").selectOption("__custom__");
  await page.getByLabel("Nombre del nuevo tipo de pieza").fill("Componente E2E personalizado");
  await page.getByLabel("Número de parte").fill("E2E-CUSTOM-CATALOG");
  await page.getByRole("button", { name: "Crear producto" }).click();
  await expect(page).toHaveURL(/\/admin\/productos\/[0-9a-f-]+\?notice=created/u, { timeout: 20_000 });

  await expect(page.getByLabel("Marca", { exact: true }).locator("option:checked")).toHaveText(/Marca E2E personalizada/u);
  await expect(page.getByLabel("Tipo de pieza").locator("option:checked")).toHaveText(/Componente E2E personalizado/u);
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(/notice=updated/u, { timeout: 20_000 });

  await page.reload();
  await expect(page.getByLabel("Marca", { exact: true }).locator("option:checked")).toHaveText(/Marca E2E personalizada/u);
  await expect(page.getByLabel("Tipo de pieza").locator("option:checked")).toHaveText(/Componente E2E personalizado/u);

  const customBrandId = await page.getByLabel("Marca", { exact: true }).inputValue();
  const customComponentTypeId = await page.getByLabel("Tipo de pieza").inputValue();
  await page.goto("/admin/productos/nuevo");
  await expect(
    page.getByLabel("Marca", { exact: true }).locator("option").filter({ hasText: "Marca E2E personalizada" }),
  ).toHaveCount(1);
  await expect(
    page.getByLabel("Tipo de pieza").locator("option").filter({ hasText: "Componente E2E personalizado" }),
  ).toHaveCount(1);
  await page.getByLabel("Marca", { exact: true }).selectOption("__custom__");
  await page.getByLabel("Nombre de la nueva marca").fill("  MARCA E2E PERSONALIZADA  ");
  await page.getByLabel("Tipo de pieza").selectOption("__custom__");
  await page.getByLabel("Nombre del nuevo tipo de pieza").fill(" componente e2e PERSONALIZADO ");
  await page.getByLabel("Número de parte").fill("E2E-CUSTOM-CATALOG-REUSE");
  await page.getByRole("button", { name: "Crear producto" }).click();
  await expect(page).toHaveURL(/notice=created/u, { timeout: 20_000 });
  await expect(page.getByLabel("Marca", { exact: true })).toHaveValue(customBrandId);
  await expect(page.getByLabel("Tipo de pieza")).toHaveValue(customComponentTypeId);
});

test("ADMIN completes product, stock, location, movement, image and publication", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  test.skip(testInfo.project.name.startsWith("mobile"), "The stateful acceptance flow runs once; responsive admin behavior is covered separately.");
  await login(page);

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
    headers: { Origin: currentOrigin(page) },
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
  await expect(page.getByLabel("Texto alternativo")).toHaveValue("Producto integral E2E");
  await page.reload();
  await expect(page.getByLabel("Texto alternativo")).toHaveValue("Producto integral E2E");
  await page.goto("/catalogo?q=E2E-FULL-001");
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.goto("/admin");
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login/u);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin/u);
});
