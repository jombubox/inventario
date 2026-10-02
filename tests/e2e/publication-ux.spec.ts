import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { testImage } from "./helpers/test-image";
test.use({ actionTimeout: 15_000 });

const localDb = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
test.skip(!localDb || !["127.0.0.1", "localhost"].includes(localDb.hostname) || localDb.pathname !== "/jumbobox_test", "Requires disposable local jumbobox_test.");

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("admin@e2e.local");
  await page.getByLabel("Contraseña").fill("JombuBox-E2E-Admin-123!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
}
async function newProduct(page: Page): Promise<Locator> {
  await page.locator("[data-quick-add-trigger]").filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
  return dialog;
}
async function snapshot(page: Page, testInfo: TestInfo, name: string) {
  await expect(page.getByText("Preparando JombuBox…", { exact: true })).toHaveCount(0);
  await page.locator("img").evaluateAll(async (images) => {
    await Promise.all(images.filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    }).map((image) => (image as HTMLImageElement).decode().catch(() => undefined)));
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} has horizontal page overflow`).toBeLessThanOrEqual(1);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("Quick Add publishes price and photos, manages locations inline, and reviews table data", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const mobile = testInfo.project.name.startsWith("mobile");
  await page.setViewportSize(mobile ? { width: 393, height: 727 } : { width: 1440, height: 900 });
  const suffix = mobile ? "MOBILE" : "DESKTOP";
  const part = `UX-PUBLIC-${suffix}`;
  const title = `Sensor de prueba ${suffix}`;
  const warehouseName = `Almacén publicación ${suffix}`;
  const renamedWarehouse = `${warehouseName} norte`;
  await login(page);
  const dialog = await newProduct(page);
  await expect(dialog.getByLabel("Estado", { exact: true })).toHaveValue("ACTIVE");
  await expect(dialog.getByRole("checkbox", { name: "Visible en el catálogo público" })).toBeChecked();
  await expect(dialog.getByText("MXN", { exact: true })).toBeVisible();
  await dialog.getByLabel("Número de parte", { exact: true }).fill(part);
  await dialog.getByLabel("Nombre del producto").fill(title);
  await dialog.getByLabel("Precio de venta").fill("-1");
  await dialog.getByRole("button", { name: "Continuar con ubicación" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Escribe un precio");
  await dialog.getByLabel("Precio de venta").fill("1250.01");
  for (const model of [`MODELO-A-${suffix}`, `MODELO-B-${suffix}`]) {
    await dialog.getByLabel("Buscar modelo compatible").fill(model);
    await dialog.getByRole("option", { name: new RegExp(`Agregar.*${model}`, "u") }).click();
  }
  await dialog.getByLabel(/Agregar fotos/u).setInputFiles([
    { name: "frente.png", mimeType: "image/png", buffer: testImage() },
    { name: "reverso.png", mimeType: "image/png", buffer: testImage() },
  ]);
  await dialog.getByLabel("Precio de venta").scrollIntoViewIfNeeded();
  await snapshot(page, testInfo, "quick-add-publication");
  await dialog.getByRole("checkbox", { name: "Visible en el catálogo público" }).scrollIntoViewIfNeeded();
  await snapshot(page, testInfo, "quick-add-status-visibility");
  await dialog.getByRole("button", { name: "Continuar con ubicación" }).click();
  await dialog.getByLabel("Cantidad", { exact: true }).fill("5");
  await dialog.getByRole("button", { name: "Agregar ubicación", exact: false }).click();
  await dialog.getByLabel("Código de ubicación").fill(`UX-WH-${suffix}`);
  await dialog.getByLabel("Nombre de ubicación").fill(warehouseName);
  await snapshot(page, testInfo, "inline-location-create");
  await dialog.getByRole("button", { name: "Guardar ubicación" }).click();
  await expect(dialog.getByLabel("Ubicación", { exact: true })).toContainText(warehouseName);
  await expect(dialog.getByLabel("Cantidad", { exact: true })).toHaveValue("5");
  await dialog.getByRole("button", { name: "Editar ubicación", exact: true }).click();
  await dialog.getByLabel("Nombre de ubicación").fill(renamedWarehouse);
  await snapshot(page, testInfo, "inline-location-edit");
  await dialog.getByRole("button", { name: "Guardar ubicación" }).click();
  await expect(dialog.getByLabel("Ubicación", { exact: true }).locator("option:checked")).toHaveText(renamedWarehouse);
  await dialog.getByRole("button", { name: "← Cambiar producto" }).click();
  await expect(dialog.getByLabel("Número de parte", { exact: true })).toHaveValue(part);
  await expect(dialog.getByLabel("Precio de venta")).toHaveValue("1250.01");
  await expect(dialog.getByRole("button", { name: "Quitar frente.png" })).toBeVisible();
  await expect(dialog.getByRole("list", { name: "Modelos compatibles seleccionados" }).getByRole("listitem")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Continuar con ubicación" }).click();
  await dialog.getByRole("button", { name: "Crear caja" }).click();
  await dialog.getByLabel("Código", { exact: true }).fill(`UX-BOX-${suffix}`);
  await dialog.getByLabel("Nombre", { exact: true }).fill(`Caja publicación ${suffix}`);
  let releaseUpload: () => void = () => {};
  const uploadGate = new Promise<void>((resolve) => { releaseUpload = resolve; });
  await page.route("**/api/products/images/upload", async (route) => { await uploadGate; await route.continue(); });
  await dialog.getByRole("button", { name: "Guardar producto" }).click();
  await expect(dialog.getByText("Subiendo foto 1 de 2…")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText("Las fotos se guardaron correctamente.")).toHaveCount(0);
  const publicationLink = dialog.getByRole("link", { name: "Ver publicación" });
  await expect(publicationLink).toHaveAttribute("target", "_blank");
  const publicPath = await publicationLink.getAttribute("href");
  expect(publicPath).toMatch(/^\/catalogo\/[a-z0-9-]+$/u);
  releaseUpload();
  await expect(dialog.getByText("Las fotos se guardaron correctamente.")).toBeVisible({ timeout: 30_000 });
  await snapshot(page, testInfo, "publication-success");
  const popupPromise = page.waitForEvent("popup");
  await publicationLink.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(new RegExp(`${publicPath}$`, "u"));
  await expect(popup.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(popup.getByText("$1,250.01", { exact: true }).first()).toBeVisible();
  const mainImage = popup.getByRole("button", { name: `Ampliar fotos de ${title}` });
  await expect(mainImage.locator("img")).toBeVisible();
  await expect.poll(() => mainImage.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  if (!mobile) {
    const bounds = await mainImage.boundingBox();
    expect(bounds).toBeTruthy();
    await popup.mouse.move(bounds!.x + bounds!.width * .25, bounds!.y + bounds!.height * .25);
    const zoom = popup.locator("[data-product-zoom]");
    await expect(zoom).toHaveAttribute("style", /scale\(2.25\)/u);
    const firstOrigin = await zoom.evaluate((element) => (element as HTMLElement).style.transformOrigin);
    await popup.mouse.move(bounds!.x + bounds!.width * .75, bounds!.y + bounds!.height * .75);
    expect(await zoom.evaluate((element) => (element as HTMLElement).style.transformOrigin)).not.toBe(firstOrigin);
    expect(await mainImage.boundingBox()).toEqual(bounds);
    await snapshot(popup, testInfo, "desktop-image-zoom");
    await popup.mouse.move(0, 0);
    await expect(zoom).toHaveAttribute("style", /scale\(1\)/u);
  } else {
    await expect(popup.locator("[data-product-zoom]")).not.toHaveAttribute("style", /scale\(2.25\)/u);
  }
  await mainImage.click();
  await expect(popup.getByRole("dialog", { name: `Fotos de ${title}` })).toBeVisible();
  await snapshot(popup, testInfo, "public-image-viewer");
  await popup.keyboard.press("Escape");
  await expect(mainImage).toBeFocused();
  await popup.close();
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.goto(`/admin/productos?q=${part}`);
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toContainText("$1,250.01");
  await expect(row.getByRole("link", { name: "Editar" })).toBeVisible();
  if (!mobile) {
    await expect(page.getByRole("columnheader", { name: "Precio", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Modelos", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Actualizado", exact: true })).toHaveCount(0);
    await expect(row.getByRole("cell").nth(2)).toHaveText(/^[A-Z0-9-]+$/u);
  }
  await row.scrollIntoViewIfNeeded();
  await snapshot(page, testInfo, "products-table");
  const thumb = row.getByRole("button", { name: `Ver fotos de ${title}` });
  await thumb.click();
  let modal = page.getByRole("dialog", { name: "Fotos del producto" });
  await expect(modal.getByRole("status")).toHaveText("1 de 2");
  await modal.getByRole("button", { name: "Siguiente" }).click();
  await expect(modal.getByRole("status")).toHaveText("2 de 2");
  await snapshot(page, testInfo, "admin-image-preview");
  await page.keyboard.press("Escape");
  await expect(thumb).toBeFocused();
  await row.getByRole("button", { name: "Ver compatibilidad (2)" }).filter({ visible: true }).click();
  modal = page.getByRole("dialog", { name: "Modelos compatibles" });
  await expect(modal.getByText(`MODELO-A-${suffix}`, { exact: true })).toBeVisible();
  await expect(modal.getByText(`MODELO-B-${suffix}`, { exact: true })).toBeVisible();
  await snapshot(page, testInfo, "compatibility-modal");
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "Detalles" }).click();
  modal = page.getByRole("dialog", { name: "Detalles del producto" });
  await expect(modal.getByText("Última actualización", { exact: true })).toBeVisible();
  await expect(modal.getByText("Visible", { exact: true })).toBeVisible();
  await snapshot(page, testInfo, "details-modal");
  await page.keyboard.press("Escape");
  await row.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByLabel("Precio de venta")).toHaveValue("1250.01");
  await expect(page.getByLabel("Estado", { exact: true })).toHaveValue("ACTIVE");
  await expect(page.getByRole("checkbox", { name: "Visible en el catálogo público" })).toBeChecked();
  await expect(page.getByLabel("Moneda", { exact: true })).toHaveValue("MXN");
});

test("private creation stays private and optional photo failure offers a retry", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await login(page);
  const suffix = testInfo.project.name.startsWith("mobile") ? "MOB" : "DESK";
  const part = `UX-PRIVATE-${suffix}`;
  const dialog = await newProduct(page);
  await dialog.getByLabel("Número de parte", { exact: true }).fill(part);
  await dialog.getByRole("checkbox", { name: "Visible en el catálogo público" }).uncheck();
  await dialog.getByRole("button", { name: "Continuar con ubicación" }).click();
  await dialog.getByLabel("Ubicación", { exact: true }).selectOption({ label: "Almacén E2E" });
  await dialog.getByRole("button", { name: "Guardar producto" }).click();
  await expect(dialog.getByText("Publicación: este producto no está visible en el catálogo público.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Ver publicación" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.goto(`/admin/productos?q=${part}`);
  const row = page.getByRole("row").filter({ hasText: part });
  await expect(row.getByRole("img", { name: "Producto sin imagen" })).toBeVisible();
  await expect(row.locator("td").nth(5)).toHaveText("—");
  await row.getByRole("button", { name: "Ver compatibilidad (0)" }).filter({ visible: true }).click();
  await expect(page.getByText("Este producto no tiene modelos compatibles registrados.")).toBeVisible();
  await page.keyboard.press("Escape");
  await row.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByRole("checkbox", { name: "Visible en el catálogo público" })).not.toBeChecked();
  await page.goto(`/catalogo?q=${part}`);
  await expect(page.locator('a[href^="/catalogo/"]').filter({ hasText: part })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No encontramos coincidencias." })).toBeVisible();
  await page.goto("/admin/productos");
  const second = await newProduct(page);
  await second.getByLabel("Número de parte", { exact: true }).fill(`UX-RETRY-${suffix}`);
  await second.getByLabel(/Agregar fotos/u).setInputFiles({ name: "frente.png", mimeType: "image/png", buffer: testImage() });
  let fail = true;
  await page.route("**/api/products/images/upload", async (route) => {
    if (fail) { fail = false; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Foto pendiente de prueba." }) }); }
    else await route.continue();
  });
  await second.getByRole("button", { name: "Continuar con ubicación" }).click();
  await second.getByLabel("Ubicación", { exact: true }).selectOption({ label: "Almacén E2E" });
  await second.getByRole("button", { name: "Guardar producto" }).click();
  await expect(second.getByText("El producto y el inventario sí se guardaron.")).toBeVisible();
  await expect(second.getByRole("link", { name: "Ver publicación" })).toBeVisible();
  await expect(second.getByText("Las fotos se guardaron correctamente.")).toHaveCount(0);
  await second.getByRole("button", { name: "Reintentar fotos pendientes" }).click();
  await expect(second.getByText("Las fotos se guardaron correctamente.")).toBeVisible({ timeout: 20_000 });
});

test("publication controls and product review fit the 900 by 900 viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "The desktop project covers the intermediate viewport.");
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 900, height: 900 });
  await login(page);
  await page.goto("/admin/productos?q=UX-PUBLIC-DESKTOP");
  const row = page.getByRole("row").filter({ hasText: "Sensor de prueba DESKTOP" });
  await expect(row).toBeVisible();
  await snapshot(page, testInfo, "900-products-table");
  for (const [action, title, name] of [
    ["Ver fotos de Sensor de prueba DESKTOP", "Fotos del producto", "900-image-preview"],
    ["Ver compatibilidad (2)", "Modelos compatibles", "900-compatibility"],
    ["Detalles", "Detalles del producto", "900-details"],
  ]) {
    await row.getByRole("button", { name: action, exact: true }).filter({ visible: true }).click();
    const modal = page.getByRole("dialog", { name: title, exact: true });
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Cargando…", { exact: true })).toHaveCount(0);
    await snapshot(page, testInfo, name!);
    if (title === "Detalles del producto") {
      const publicPath = await modal.getByRole("link", { name: "Ver publicación" }).getAttribute("href");
      await page.keyboard.press("Escape");
      await page.goto(publicPath!);
      await snapshot(page, testInfo, "900-public-product");
      await page.goto("/admin/productos?q=UX-PUBLIC-DESKTOP");
    } else await page.keyboard.press("Escape");
  }
  const dialog = await newProduct(page);
  await dialog.getByLabel("Número de parte", { exact: true }).fill("SIN-GUARDAR-900");
  await dialog.getByLabel("Precio de venta").fill("1250.00");
  await dialog.getByLabel("Precio de venta").scrollIntoViewIfNeeded();
  await snapshot(page, testInfo, "900-quick-add-publication");
  await dialog.getByRole("button", { name: "Continuar con ubicación" }).click();
  await dialog.getByRole("button", { name: "Agregar ubicación", exact: false }).click();
  await snapshot(page, testInfo, "900-inline-location-create");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog.getByRole("button", { name: "Editar ubicación", exact: true }).click();
  await snapshot(page, testInfo, "900-inline-location-edit");
});
