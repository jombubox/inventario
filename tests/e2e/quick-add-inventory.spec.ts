import { expect, test, type Page } from "@playwright/test";

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

test("quick add reuses an existing model, creates a new model and preserves box safety", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const suffix = testInfo.project.name.startsWith("mobile") ? "MOB" : "DESK";
  const bagLabel = `Bolsa E2E ${suffix}`;
  const newPartNumber = `E2E-QUICK-NEW-${suffix}`;
  const primarySerial = `E2E-MAIN-${suffix}`;
  const editedPrimarySerial = `E2E-MAIN-EDIT-${suffix}`;
  const secondarySerialOne = `E2E-ALT-A-${suffix}`;
  const secondarySerialTwo = `E2E-ALT-B-${suffix}`;
  const secondarySerialThree = `E2E-ALT-C-${suffix}`;
  const newBoxCode = `E2E-Q-${suffix}`;
  const emptyBoxCode = `E2E-EMPTY-${suffix}`;
  await login(page);

  const adminNav = page.getByRole("navigation", {
    name: testInfo.project.name.startsWith("mobile")
      ? "Navegación móvil de administración"
      : "Navegación de administración",
  });
  if (!testInfo.project.name.startsWith("mobile")) {
    await expect(adminNav.getByText("Espacio de trabajo", { exact: true })).toBeVisible();
    await expect(adminNav.getByText("Otros", { exact: true })).toBeVisible();
  }
  await expect(adminNav.getByRole("link", { name: "Resumen", exact: true })).toHaveAttribute("aria-current", "page");

  await adminNav.getByRole("button", { name: "Agregar producto" }).click();
  let dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await dialog.getByLabel("Buscar modelo").fill("EAY 123456");
  await expect(dialog.getByText("LG-PSU-EAY123456", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: /Crear nuevo modelo/u }).click();
  await expect(dialog.getByText("Encontramos modelos parecidos", { exact: true })).toBeVisible();
  await dialog.getByRole("button").filter({ hasText: "LG-PSU-EAY123456" }).click();
  await expect(dialog.getByText("Modelo encontrado", { exact: true })).toBeVisible();
  await dialog.getByLabel("Bolsa (opcional)").fill(bagLabel);
  await dialog.getByLabel("Cantidad").fill("3");
  const existingSubmit = dialog.getByRole("button", { name: "Agregar 3 al inventario" });
  await existingSubmit.click();
  await expect(dialog.getByText(/3 unidad\(es\) agregadas correctamente/u)).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();

  await page.goto("/admin/inventario?q=EAY123456");
  const existingStock = page.locator("article").filter({ hasText: "EAY123456" });
  await expect(existingStock.filter({ hasText: bagLabel }).first()).toContainText("3");

  await adminNav.getByRole("button", { name: "Agregar producto" }).click();
  dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await dialog.getByLabel("Buscar modelo").fill(newPartNumber);
  await expect(dialog.getByText("No encontramos este modelo", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Crear nuevo modelo" }).click();
  await dialog.getByLabel("Número de serie principal (opcional)").fill(primarySerial);
  const addSecondary = dialog.getByRole("button", {
    name: "Agregar número de serie secundario",
  });
  await addSecondary.click();
  await dialog.getByRole("textbox", { name: "Número de serie secundario 1", exact: true }).fill(secondarySerialOne);
  await addSecondary.click();
  await dialog.getByRole("textbox", { name: "Número de serie secundario 2", exact: true }).fill(secondarySerialTwo);
  await dialog.getByRole("button", { name: "Continuar con ubicación" }).click();
  await dialog.getByRole("button", { name: "Crear nueva caja" }).click();
  await dialog.getByLabel("Código").fill(newBoxCode);
  await dialog.getByLabel("Nombre").fill(`Caja E2E ${suffix}`);
  await dialog.getByLabel("Cantidad").fill("2");
  await dialog.getByRole("button", { name: "Agregar 2 al inventario" }).click();
  await expect(dialog.getByText(/2 unidad\(es\) agregadas correctamente/u)).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();

  await page.goto(`/admin/inventario?q=${newPartNumber}`);
  const newStock = page.locator("article").filter({ hasText: newPartNumber });
  await expect(newStock).toBeVisible();
  await expect(newStock).toContainText(`Caja E2E ${suffix}`);
  await page.reload();
  await expect(page.locator("article").filter({ hasText: newPartNumber })).toBeVisible();

  await adminNav.getByRole("button", { name: "Agregar producto" }).click();
  dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await dialog.getByLabel("Buscar modelo").fill(secondarySerialTwo);
  await expect(dialog.getByText(primarySerial, { exact: false })).toBeVisible();
  await dialog.getByRole("button").filter({ hasText: newPartNumber }).click();
  await expect(dialog.getByText("Modelo encontrado", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Número de serie principal (opcional)")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Agregar número de serie secundario" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto(`/admin/productos?q=${secondarySerialTwo}`);
  const productRow = page.getByRole("row").filter({ hasText: newPartNumber });
  await productRow.getByRole("link", { name: "Editar" }).click();
  await page.getByLabel("Número de serie principal (opcional)").fill(editedPrimarySerial);
  await page.getByRole("button", { name: "Agregar número de serie secundario" }).click();
  await page.getByRole("textbox", { name: "Número de serie secundario 3", exact: true }).fill(secondarySerialThree);
  await page.getByRole("button", { name: "Quitar número de serie secundario 1" }).click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Producto actualizado correctamente.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Número de serie principal (opcional)")).toHaveValue(editedPrimarySerial);
  await expect(page.getByRole("textbox", { name: "Número de serie secundario 1", exact: true })).toHaveValue(secondarySerialTwo);
  await expect(page.getByRole("textbox", { name: "Número de serie secundario 2", exact: true })).toHaveValue(secondarySerialThree);
  await expect(page.getByRole("textbox", { name: "Número de serie secundario 3", exact: true })).toHaveCount(0);

  await page.goto(`/admin/movimientos?q=${newPartNumber}`);
  await expect(page.getByRole("row").filter({ hasText: newPartNumber })).toContainText("INITIAL");

  await page.goto("/admin/ubicaciones");
  const stockedBox = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Caja E2E A01", exact: true }),
  });
  await stockedBox.getByText("Editar datos o cambiar ubicación padre", { exact: true }).click();
  page.once("dialog", (browserDialog) => browserDialog.accept());
  await stockedBox.getByRole("button", { name: "Eliminar caja" }).click();
  await expect(stockedBox.getByText(/No puedes eliminar esta caja porque todavía contiene/u)).toBeVisible();

  await page.locator("summary").filter({ hasText: /^Crear ubicación$/u }).click();
  const createLocation = page.locator("details").filter({ hasText: "Crear ubicación" }).locator("form");
  await createLocation.getByLabel("Código", { exact: true }).fill(emptyBoxCode);
  await createLocation.getByLabel("Nombre", { exact: true }).fill(`Caja vacía E2E ${suffix}`);
  await createLocation.getByLabel("Tipo").selectOption("BOX");
  await createLocation.getByRole("button", { name: "Crear ubicación" }).click();
  await expect(page.getByText("Ubicación creada.", { exact: true })).toBeVisible();
  const emptyBox = page.locator("article").filter({
    has: page.getByRole("heading", { name: `Caja vacía E2E ${suffix}`, exact: true }),
  });
  await emptyBox.getByText("Editar datos o cambiar ubicación padre", { exact: true }).click();
  page.once("dialog", (browserDialog) => browserDialog.accept());
  await emptyBox.getByRole("button", { name: "Eliminar caja" }).click();
  await expect(
    page.locator("article").filter({
      has: page.getByRole("heading", { name: `Caja vacía E2E ${suffix}`, exact: true }),
    }),
  ).toHaveCount(0);
});

test("quick add is keyboard and mobile friendly", async ({ page }, testInfo) => {
  await login(page);
  const adminNav = page.getByRole("navigation", {
    name: testInfo.project.name.startsWith("mobile")
      ? "Navegación móvil de administración"
      : "Navegación de administración",
  });
  const trigger = adminNav.getByRole("button", { name: "Agregar producto" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await expect(dialog.getByLabel("Buscar modelo")).toBeFocused();
  await dialog.getByLabel("Buscar modelo").fill("EAY123456");
  await expect(dialog.getByText("LG-PSU-EAY123456", { exact: false })).toBeVisible();
  await dialog.getByRole("button").filter({ hasText: "LG-PSU-EAY123456" }).click();
  await expect(dialog.getByLabel("Ubicación")).toBeVisible();
  await expect(dialog.getByLabel("Caja")).toBeVisible();
  await expect(dialog.getByLabel("Bolsa (opcional)")).toBeVisible();
  await expect(dialog.getByLabel("Cantidad")).toBeVisible();
  const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
