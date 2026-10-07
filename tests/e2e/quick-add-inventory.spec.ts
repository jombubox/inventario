import { goToQuickAddStep } from "./helpers/quick-add-wizard";
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

test("quick add reuses an existing product, creates a product with multiple compatible models and preserves box safety", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const suffix = testInfo.project.name.startsWith("mobile") ? "MOB" : "DESK";
  const bagLabel = `Bolsa E2E ${suffix}`;
  const newPartNumber = `E2E-QUICK-NEW-${suffix}`;
  const primarySerial = `E2E-MAIN-${suffix}`;
  const editedPrimarySerial = `E2E-MAIN-EDIT-${suffix}`;
  const secondarySerialOne = `E2E-ALT-A-${suffix}`;
  const secondarySerialTwo = `E2E-ALT-B-${suffix}`;
  const secondarySerialThree = `E2E-ALT-C-${suffix}`;
  const inlineCompatibleModel = `UN75E2ENEW${suffix}`;
  const inlineBrand = `Marca E2E ${suffix}`;
  const inlinePieceType = `Sensor E2E ${suffix}`;
  const newBoxCode = `E2E-Q-${suffix}`;
  const emptyBoxCode = `E2E-EMPTY-${suffix}`;
  await login(page);

  const adminNav = page.getByRole("navigation", {
    name: testInfo.project.name.startsWith("mobile")
      ? "Navegación móvil de gestión"
      : "Navegación de gestión",
  });
  if (!testInfo.project.name.startsWith("mobile")) {
    await expect(adminNav.getByText("Espacio de trabajo", { exact: true })).toBeVisible();
    await expect(adminNav.getByText("Otros", { exact: true })).toBeVisible();
  }
  await expect(adminNav.getByRole("link", { name: "Tablero principal", exact: true })).toHaveAttribute("aria-current", "page");

  await page.goto("/admin/ubicaciones");
  const activeWarehouse = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Almacén E2E", exact: true }),
  });
  await expect(activeWarehouse.getByText("Activa", { exact: true })).toBeVisible();

  await adminNav.getByRole("button", { name: "Agregar producto" }).click();
  let dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await expect(dialog.getByLabel("Buscar producto")).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Marca y tipo de pieza" })).toBeVisible();
  await expect(dialog.getByText("Paso 1 de 5", { exact: true })).toBeVisible();
  await goToQuickAddStep(dialog, 1);
  await dialog.getByRole("button", { name: "← Volver a buscar" }).click();
  await dialog.getByLabel("Buscar producto").fill("EAY 123456");
  await expect(dialog.getByText("LG-PSU-EAY123456", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: /Agregar producto nuevo/u }).click();
  await expect(dialog.getByText("Encontramos productos parecidos", { exact: true })).toBeVisible();
  await dialog.getByRole("button").filter({ hasText: "LG-PSU-EAY123456" }).click();
  await expect(dialog.getByText("Producto encontrado", { exact: true })).toBeVisible();
  await goToQuickAddStep(dialog, 5);
  await expect(dialog.getByLabel("Ubicación")).toContainText("Almacén E2E");
  await goToQuickAddStep(dialog, 5);
  await dialog.getByLabel("Ubicación").selectOption({ label: "Almacén E2E" });
  await goToQuickAddStep(dialog, 5);
  await dialog.getByLabel("Bolsa (opcional)").fill(bagLabel);
  await goToQuickAddStep(dialog, 5);
  await dialog.getByLabel(/^Cantidad(?: de piezas)?$/u).fill("3");
  const existingSubmit = dialog.getByRole("button", { name: "Agregar 3 al inventario" });
  await existingSubmit.click();
  await expect(dialog.getByText(/3 unidad\(es\) agregadas correctamente/u)).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();

  await page.goto("/admin/inventario?q=EAY123456");
  const existingStock = page.locator("article").filter({ hasText: "EAY123456" });
  await expect(existingStock.filter({ hasText: bagLabel }).first()).toContainText("3");

  await adminNav.getByRole("button", { name: "Agregar producto" }).click();
  dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
  await goToQuickAddStep(dialog, 2);
  await dialog.getByLabel("Número de parte").fill(newPartNumber);
  await goToQuickAddStep(dialog, 2);
  await dialog.getByLabel("Número de serie principal (opcional)").fill(primarySerial);
  await goToQuickAddStep(dialog, 1);
  await dialog.getByRole("button", { name: /Agregar nueva marca/u }).click();
  await dialog.getByLabel("Nueva marca").fill(inlineBrand);
  await goToQuickAddStep(dialog, 1);
  await dialog.getByRole("button", { name: "Guardar marca" }).click();
  await expect(dialog.getByText("Se creó la marca.")).toBeVisible();
  await goToQuickAddStep(dialog, 1);
  await dialog.getByRole("button", { name: /Agregar nueva marca/u }).click();
  await dialog.getByLabel("Nueva marca").fill(`  ${inlineBrand.toUpperCase()}  `);
  await goToQuickAddStep(dialog, 1);
  await dialog.getByRole("button", { name: "Guardar marca" }).click();
  await expect(dialog.getByText("Esta marca ya existe; la seleccionamos.")).toBeVisible();
  await goToQuickAddStep(dialog, 2);
  await expect(dialog.getByLabel("Número de parte")).toHaveValue(newPartNumber);
  await goToQuickAddStep(dialog, 2);
  await expect(dialog.getByLabel("Número de serie principal (opcional)")).toHaveValue(primarySerial);
  await goToQuickAddStep(dialog, 1);
  await dialog.getByRole("button", { name: /Agregar tipo de pieza/u }).click();
  await dialog.getByLabel("Nuevo tipo de pieza").fill(inlinePieceType);
  await goToQuickAddStep(dialog, 1);
  await dialog.getByRole("button", { name: "Guardar tipo de pieza" }).click();
  await expect(dialog.getByText("Se creó el tipo de pieza.")).toBeVisible();
  await goToQuickAddStep(dialog, 1);
  await dialog.getByRole("button", { name: /Agregar tipo de pieza/u }).click();
  await dialog.getByLabel("Nuevo tipo de pieza").fill(inlinePieceType.toLowerCase());
  await goToQuickAddStep(dialog, 1);
  await dialog.getByRole("button", { name: "Guardar tipo de pieza" }).click();
  await expect(dialog.getByText("Este tipo de pieza ya existe; lo seleccionamos.")).toBeVisible();
  await goToQuickAddStep(dialog, 2);
  const addSecondary = dialog.getByRole("button", {
    name: "Agregar número de serie secundario",
  });
  await addSecondary.click();
  await dialog.getByRole("textbox", { name: "Número de serie secundario 1", exact: true }).fill(secondarySerialOne);
  await addSecondary.click();
  await dialog.getByRole("textbox", { name: "Número de serie secundario 2", exact: true }).fill(secondarySerialTwo);

  await goToQuickAddStep(dialog, 3);
  await dialog.getByLabel("Marca del modelo compatible").selectOption({ label: "Samsung" });
  await goToQuickAddStep(dialog, 3);
  const compatibleSearch = dialog.getByLabel("Buscar modelo compatible");
  await compatibleSearch.fill("UN55NU7100");
  await goToQuickAddStep(dialog, 3);
  await dialog.getByRole("option", { name: /Samsung UN55NU7100FXZX/u }).click();
  await compatibleSearch.fill("UN58NU7100");
  await goToQuickAddStep(dialog, 3);
  await dialog.getByRole("option", { name: /Samsung UN58NU7100FXZX/u }).click();
  await compatibleSearch.fill(inlineCompatibleModel);
  await expect(dialog.getByText("No encontramos este modelo.", { exact: true })).toBeVisible();
  await goToQuickAddStep(dialog, 3);
  await dialog.getByRole("option", { name: new RegExp(`Agregar.*${inlineCompatibleModel}`, "u") }).click();
  await goToQuickAddStep(dialog, 3);
  const selectedModels = dialog.getByRole("list", { name: "Modelos compatibles seleccionados" });
  await expect(selectedModels.getByRole("listitem")).toHaveCount(3);

  await goToQuickAddStep(dialog, 4);
  const photoInput = dialog.getByLabel(/Agregar fotos/u);
  await photoInput.setInputFiles({ name: "archivo.txt", mimeType: "text/plain", buffer: Buffer.from("no-image") });
  await expect(dialog.getByText(/no es una imagen JPEG, PNG o WEBP/u)).toBeVisible();
  await photoInput.setInputFiles({ name: "grande.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(dialog.getByText(/supera el límite de 10 MB/u)).toBeVisible();
  await photoInput.setInputFiles([
    { name: `quitar-${suffix}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from("ffd8ffe00000000000000000", "hex") },
    { name: `frente-${suffix}.png`, mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlDkAAAAASUVORK5CYII=", "base64") },
    { name: `reverso-${suffix}.webp`, mimeType: "image/webp", buffer: Buffer.from("UklGRiIAAABXRUJQVlA4ICAAAADQAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==", "base64") },
  ]);
  await expect(dialog.getByText("Foto principal", { exact: true })).toBeVisible();
  await goToQuickAddStep(dialog, 4);
  await dialog.getByRole("button", { name: `Eliminar foto: quitar-${suffix}.jpg` }).click();
  await expect(dialog.getByRole("button", { name: `Eliminar foto: quitar-${suffix}.jpg` })).toHaveCount(0);
  await expect(dialog.getByText("Foto principal", { exact: true })).toBeVisible();
  await goToQuickAddStep(dialog, 3);
  await dialog.getByRole("button", {
    name: "Eliminar modelo compatible Samsung UN55NU7100FXZX",
  }).click();
  await expect(selectedModels.getByRole("listitem")).toHaveCount(2);
  await compatibleSearch.fill("UN55NU7100");
  await goToQuickAddStep(dialog, 3);
  await dialog.getByRole("option", { name: /Samsung UN55NU7100FXZX/u }).click();
  await expect(selectedModels.getByRole("listitem")).toHaveCount(3);

  await goToQuickAddStep(dialog, 5);
  await dialog.getByLabel("Ubicación").selectOption({
    label: `Almacén E2E sin cajas ${suffix}`,
  });
  await expect(dialog.getByText("No hay cajas en esta ubicación.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Crear caja" }).click();
  await dialog.getByLabel("Código").fill(newBoxCode);
  await dialog.getByLabel("Nombre").fill(`Caja E2E ${suffix}`);
  await goToQuickAddStep(dialog, 5);
  await dialog.getByLabel(/^Cantidad(?: de piezas)?$/u).fill("2");
  await goToQuickAddStep(dialog, 5);
  await dialog.getByRole("button", { name: "Agregar producto" }).click();
  await expect(dialog.getByText(/2 unidad\(es\) agregadas correctamente/u)).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText("Las fotos se guardaron correctamente.", { exact: true })).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();

  await page.goto(`/admin/inventario?q=${newPartNumber}`);
  const newStock = page.locator("article").filter({ hasText: newPartNumber });
  await expect(newStock).toBeVisible();
  await expect(newStock).toContainText(`Caja E2E ${suffix}`);
  await page.reload();
  await expect(page.locator("article").filter({ hasText: newPartNumber })).toBeVisible();

  await adminNav.getByRole("button", { name: "Agregar producto" }).click();
  dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await dialog.getByLabel("Buscar producto").fill(secondarySerialTwo);
  await expect(dialog.getByText(primarySerial, { exact: false })).toBeVisible();
  await dialog.getByRole("button").filter({ hasText: newPartNumber }).click();
  await expect(dialog.getByText("Producto encontrado", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Número de serie principal (opcional)")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Agregar número de serie secundario" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto(`/admin/productos?q=${secondarySerialTwo}`);
  const productRow = page.getByRole("row").filter({ hasText: newPartNumber });
  await productRow.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByAltText(`frente-${suffix}`)).toBeVisible();
  await expect(page.getByAltText(`reverso-${suffix}`)).toBeVisible();
  await expect(page.getByText("Principal", { exact: true })).toBeVisible();
  await page.getByLabel("Número de serie principal (opcional)").fill(editedPrimarySerial);
  await page.getByRole("button", { name: "Agregar número de serie secundario" }).click();
  await page.getByRole("textbox", { name: "Número de serie secundario 3", exact: true }).fill(secondarySerialThree);
  await page.getByRole("button", { name: "Quitar número de serie secundario 1" }).click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Producto actualizado correctamente.", { exact: true })).toBeVisible();
  await page.reload();
  const persistedModels = page.getByRole("list", { name: "Modelos compatibles seleccionados" });
  await expect(persistedModels.getByRole("listitem")).toHaveCount(3);
  await expect(persistedModels).toContainText("UN55NU7100FXZX");
  await expect(persistedModels).toContainText("UN58NU7100FXZX");
  await expect(persistedModels).toContainText(inlineCompatibleModel);
  await expect(page.getByLabel("Número de serie principal (opcional)")).toHaveValue(editedPrimarySerial);
  await expect(page.getByRole("textbox", { name: "Número de serie secundario 1", exact: true })).toHaveValue(secondarySerialTwo);
  await expect(page.getByRole("textbox", { name: "Número de serie secundario 2", exact: true })).toHaveValue(secondarySerialThree);
  await expect(page.getByRole("textbox", { name: "Número de serie secundario 3", exact: true })).toHaveCount(0);

  await page.goto(`/admin/movimientos?q=${newPartNumber}`);
  await expect(page.getByRole("row").filter({ hasText: newPartNumber })).toContainText("Registro inicial");

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
      ? "Navegación móvil de gestión"
      : "Navegación de gestión",
  });
  const trigger = adminNav.getByRole("button", { name: "Agregar producto" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await expect(dialog.getByLabel("Buscar producto")).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true })).toBeVisible();
  await dialog.getByLabel("Buscar producto").fill("EAY123456");
  await expect(dialog.getByText("LG-PSU-EAY123456", { exact: false })).toBeVisible();
  await dialog.getByRole("button").filter({ hasText: "LG-PSU-EAY123456" }).click();
  await goToQuickAddStep(dialog, 5);
  await expect(dialog.getByLabel("Ubicación")).toBeVisible();
  await expect(dialog.getByLabel("Caja")).toBeVisible();
  await goToQuickAddStep(dialog, 5);
  await expect(dialog.getByLabel("Bolsa (opcional)")).toBeVisible();
  await goToQuickAddStep(dialog, 5);
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
