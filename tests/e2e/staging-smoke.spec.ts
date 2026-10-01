import { expect, test, type Locator, type Page } from "@playwright/test";

const stagingUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const smokeId = process.env.STAGING_SMOKE_ID ?? "STG-QA-20260930-1";
const credentials = {
  email: process.env.ADMIN_EMAIL ?? "",
  password: process.env.ADMIN_PASSWORD ?? "",
};

const partNumber = `${smokeId}-PART`;
const primarySerial = `${smokeId}-MAIN`;
const editedPrimarySerial = `${smokeId}-MAIN-EDIT`;
const secondaryOne = `${smokeId}-ALT-A`;
const secondaryTwo = `${smokeId}-ALT-B`;
const secondaryThree = `${smokeId}-ALT-C`;
const warehouseCode = `${smokeId}-WH`;
const warehouseName = `Almacén ${smokeId}`;
const boxCode = `${smokeId}-BOX`;
const boxName = `Caja ${smokeId}`;
const normalizedBag = `Bolsa ${smokeId}`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(credentials.email);
  await page.getByLabel("Contraseña").fill(credentials.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/u, { timeout: 30_000 });
}

async function selectOptionContaining(select: Locator, text: string) {
  const option = select.locator("option").filter({ hasText: text }).first();
  const value = await option.getAttribute("value");
  expect(value).toBeTruthy();
  await select.selectOption(value!);
}

async function expectPublicCatalogProduct(page: Page, productPartNumber: string) {
  const product = page.getByText(productPartNumber, { exact: false }).first();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await page.goto(`/catalogo?q=${encodeURIComponent(productPartNumber)}`, {
      waitUntil: "domcontentloaded",
    });
    if (response?.status() === 200 && await product.isVisible({ timeout: 15_000 }).catch(() => false)) {
      return;
    }
    await page.waitForTimeout(attempt * 1_000);
  }

  await expect(product).toBeVisible({ timeout: 30_000 });
}

test.describe("remote staging smoke", () => {
  test.skip(
    !stagingUrl.includes("jumbobox-staging") || !credentials.email || !credentials.password,
    "Requires an explicit staging URL and staging admin credentials.",
  );
  test.describe.configure({ mode: "serial" });

  test("desktop creates and exercises the staging inventory lifecycle", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(testInfo.project.name.startsWith("mobile"), "Mutating flow runs once on desktop.");

    const health = await page.request.get("/api/health");
    expect(health.status(), await health.text()).toBe(200);
    expect(health.headers()["x-powered-by"]).toBeUndefined();

    await page.goto("/admin/inventario");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Finventario/u);
    await login(page);

    await page.goto("/admin/ubicaciones");
    await page.reload();
    if (await page.getByText(warehouseCode, { exact: false }).count() === 0) {
      await page.locator("summary").filter({ hasText: /^Crear ubicación$/u }).click();
      const createLocation = page
        .locator("details")
        .filter({ hasText: "Crear ubicación" })
        .locator("form");
      await createLocation.getByLabel("Código", { exact: true }).fill(warehouseCode);
      await createLocation.getByLabel("Nombre", { exact: true }).fill(warehouseName);
      await createLocation.getByLabel("Tipo").selectOption("WAREHOUSE");
      await createLocation.getByRole("button", { name: "Crear ubicación" }).click();
      await expect(page.getByText("Ubicación creada.", { exact: true })).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.getByRole("heading", { name: warehouseName, exact: true })).toBeVisible();

    await page.goto("/admin");
    const desktopNav = page.getByRole("navigation", { name: "Navegación de gestión" });
    await desktopNav.getByRole("button", { name: "Agregar producto" }).click();
    let dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
    await dialog.getByLabel("Buscar producto").fill(partNumber);
    await expect(dialog.getByText("No encontramos este producto", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
    await dialog.getByLabel("Número de serie principal (opcional)").fill(primarySerial);
    await dialog.getByRole("button", { name: "Agregar número de serie secundario" }).click();
    await dialog.getByRole("textbox", { name: "Número de serie secundario 1", exact: true }).fill(secondaryOne);
    await dialog.getByRole("button", { name: "Agregar número de serie secundario" }).click();
    await dialog.getByRole("textbox", { name: "Número de serie secundario 2", exact: true }).fill(secondaryTwo);
    await dialog.getByRole("button", { name: "Continuar con ubicación" }).click();
    await selectOptionContaining(dialog.getByLabel("Ubicación"), warehouseName);
    const createBoxButton = dialog.getByRole("button", { name: "Crear caja" });
    if (await createBoxButton.count()) await createBoxButton.click();
    await dialog.getByLabel("Código").fill(boxCode);
    await dialog.getByLabel("Nombre").fill(boxName);
    await dialog.getByLabel("Bolsa (opcional)").fill(`  Bolsa   ${smokeId}  `);
    await dialog.getByLabel("Cantidad").fill("2");
    await dialog.getByRole("button", { name: "Agregar 2 al inventario" }).click();
    await expect(dialog.getByText(/2 unidad\(es\) agregadas correctamente/u)).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();

    await page.reload();
    await desktopNav.getByRole("button", { name: "Agregar producto" }).click();
    dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
    await dialog.getByLabel("Buscar producto").fill(`${smokeId}-ALT-B`);
    await expect(dialog.getByText(primarySerial, { exact: false })).toBeVisible();
    await dialog.getByRole("button").filter({ hasText: partNumber }).click();
    await selectOptionContaining(dialog.getByLabel("Ubicación"), warehouseName);
    await selectOptionContaining(dialog.getByLabel("Caja"), boxName);
    await dialog.getByLabel("Bolsa (opcional)").fill(normalizedBag);
    await dialog.getByLabel("Cantidad").fill("3");
    await dialog.getByRole("button", { name: "Agregar 3 al inventario" }).click();
    await expect(dialog.getByText(/3 unidad\(es\) agregadas correctamente/u)).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();

    await page.goto(`/admin/productos?q=${encodeURIComponent(`${smokeId}-ALT-B`)}`);
    const productRow = page.getByRole("row").filter({ hasText: partNumber });
    await expect(productRow).toBeVisible();
    await productRow.getByRole("link", { name: "Editar" }).click();
    await page.getByLabel("Número de serie principal (opcional)").fill(editedPrimarySerial);
    await page.getByRole("button", { name: "Agregar número de serie secundario" }).click();
    await page.getByRole("textbox", { name: "Número de serie secundario 3", exact: true }).fill(secondaryThree);
    await page.getByRole("button", { name: "Quitar número de serie secundario 1" }).click();
    await page.getByLabel("Estado").selectOption("ACTIVE");
    await page.getByLabel("Visible en el catálogo público").check();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Producto actualizado correctamente.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByLabel("Número de serie principal (opcional)")).toHaveValue(editedPrimarySerial);
    await expect(page.getByRole("textbox", { name: "Número de serie secundario 1", exact: true })).toHaveValue(secondaryTwo);
    await expect(page.getByRole("textbox", { name: "Número de serie secundario 2", exact: true })).toHaveValue(secondaryThree);

    await page.goto(`/admin/inventario?q=${encodeURIComponent(partNumber)}`);
    const stock = page.locator("article").filter({ hasText: partNumber }).first();
    await expect(stock).toContainText(boxName);
    await expect(stock).toContainText(normalizedBag);
    await expect(stock).toContainText("5");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    await page.goto(`/admin/movimientos?q=${encodeURIComponent(partNumber)}`);
    const movements = page.getByRole("row").filter({ hasText: partNumber });
    await expect(movements.filter({ has: page.getByText("INITIAL", { exact: true }) })).toHaveCount(1);
    await expect(movements.filter({ has: page.getByText("IN", { exact: true }) })).toHaveCount(1);

    await page.goto("/admin/ubicaciones");
    const stockedBox = page.locator("article").filter({ has: page.getByRole("heading", { name: boxName, exact: true }) });
    await stockedBox.getByText("Editar datos o cambiar ubicación padre", { exact: true }).click();
    page.once("dialog", (browserDialog) => browserDialog.accept());
    await stockedBox.getByRole("button", { name: "Eliminar caja" }).click();
    await expect(stockedBox.getByText(/No puedes eliminar esta caja porque todavía contiene/u)).toBeVisible();

    await expectPublicCatalogProduct(page, partNumber);
  });

  test("mobile can find the persisted product without horizontal overflow", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile verification runs in the mobile project.");
    await login(page);
    await page.goto(`/admin/inventario?q=${encodeURIComponent(partNumber)}`);
    await expect(page.locator("article").filter({ hasText: partNumber }).first()).toContainText("5");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    const mobileNav = page.getByRole("navigation", { name: "Navegación móvil de gestión" });
    await mobileNav.getByRole("button", { name: "Agregar producto" }).click();
    const dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
    await expect(dialog.getByLabel("Buscar producto")).toBeFocused();
    await dialog.getByLabel("Buscar producto").fill(editedPrimarySerial.slice(-8));
    await expect(dialog.getByRole("button").filter({ hasText: partNumber })).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("persisted staging data survives a Worker redeploy", async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);

    await page.goto(`/admin/inventario?q=${encodeURIComponent(partNumber)}`);
    const stock = page.locator("article").filter({ hasText: partNumber }).first();
    await expect(stock).toContainText("5");
    await expect(stock).toContainText(boxName);
    await expect(stock).toContainText(normalizedBag);

    await page.goto(`/admin/productos?q=${encodeURIComponent(secondaryTwo)}`);
    await expect(page.getByRole("row").filter({ hasText: partNumber })).toBeVisible();
    await expectPublicCatalogProduct(page, partNumber);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(1);
  });
});
