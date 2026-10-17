import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { goToQuickAddStep } from "./helpers/quick-add-wizard";
import { testImage } from "./helpers/test-image";

const source = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
const local = source && ["localhost", "127.0.0.1"].includes(source.hostname) && source.pathname === "/jumbobox_test";
test.skip(!local || Boolean(process.env.PLAYWRIGHT_BASE_URL), "Requires disposable PostgreSQL and fake local R2.");
test.use({ actionTimeout: 20_000 });

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(process.env.ADMIN_EMAIL ?? "admin@e2e.local");
  await page.getByLabel("Contraseña").fill(process.env.ADMIN_PASSWORD ?? "JombuBox-E2E-Admin-123!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
}

test.beforeEach(async () => {
  if (!local) return;
  const pool = new Pool({ connectionString: source!.href });
  try { await pool.query("delete from operational_rate_limits where key in ('image-upload:admin','image-confirm:admin','image-mutation:admin')"); }
  finally { await pool.end(); }
});

test("Product Edit manages persisted photos, retries safely, refreshes thumbnails and works in both themes at every requested width", async ({ page }, info) => {
  test.setTimeout(180_000);
  await login(page);
  const part = `EDIT-PHOTO-${info.project.name}-${Date.now()}`;
  await page.locator("[data-quick-add-trigger]").filter({ visible: true }).first().click();
  const wizard = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await wizard.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
  await goToQuickAddStep(wizard, 2);
  await wizard.getByLabel("Número de parte", { exact: true }).fill(part);
  await goToQuickAddStep(wizard, 4);
  await wizard.getByLabel(/Agregar fotos/u).setInputFiles({ name: "original.png", mimeType: "image/png", buffer: testImage() });
  await wizard.getByRole("button", { name: "Ver foto: original.png" }).click();
  const selectedPreview = page.getByRole("dialog", { name: "Vista previa de la foto" });
  await expect(selectedPreview.getByRole("img").first()).toBeVisible();
  await selectedPreview.getByRole("button", { name: "Cerrar ventana" }).click();
  await goToQuickAddStep(wizard, 5);
  await wizard.getByRole("button", { name: "Agregar producto", exact: true }).click();
  await expect(wizard.getByText("Las fotos se guardaron correctamente.")).toBeVisible({ timeout: 45_000 });
  await wizard.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.goto(`/admin/productos?q=${part}`);
  const editPath = await page.getByRole("link", { name: "Editar", exact: true }).getAttribute("href");
  const productId = editPath!.split("/").at(-1)!;
  await page.goto(editPath!);
  const manager = page.getByTestId("product-photo-manager");
  const photos = manager.locator("[data-image-id]");
  const ids = () => photos.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-image-id")));
  await expect(manager.getByRole("heading", { name: "Fotos del producto" })).toBeVisible();
  await expect(photos).toHaveCount(1);
  await expect(photos.first()).toContainText("Foto principal");
  const originalId = (await ids())[0];
  expect(await manager.evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(await page.locator('form input[name="id"]').first().evaluate(el => el.closest("form")!.getBoundingClientRect().top));

  const jsonSizes: number[] = [];
  page.on("request", request => { if (request.url().includes("/api/products/images/") && request.method() === "POST") jsonSizes.push(request.postDataBuffer()?.length ?? 0); });
  const picker = manager.getByLabel("Subir imágenes");
  const addButton = manager.getByRole("button", { name: "+ Agregar fotos", exact: true });
  await addButton.focus();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), addButton.press("Enter")]);
  await chooser.setFiles({ name: "single.png", mimeType: "image/png", buffer: testImage() });
  await expect(photos).toHaveCount(2, { timeout: 45_000 });
  await expect(manager.locator("[data-photo-state]")).toHaveCount(0);
  let puts = 0;
  await page.route("http://127.0.0.1:5555/**", async route => {
    if (route.request().method() === "PUT" && ++puts === 1) await route.fulfill({ status: 503 });
    else await route.continue();
  });
  await picker.setInputFiles(["retry", "later"].map(name => ({ name: `${name}.png`, mimeType: "image/png", buffer: testImage() })));
  await expect(manager.locator('[data-photo-state="failed"]')).toHaveCount(1, { timeout: 45_000 });
  await expect(photos).toHaveCount(3, { timeout: 45_000 });
  expect(await ids()).toContain(originalId);
  await expect(manager.getByText("Guardada", { exact: true })).toHaveCount(0);
  await manager.getByRole("button", { name: "Reintentar subida de retry.png" }).click();
  await expect(photos).toHaveCount(4, { timeout: 45_000 });
  await expect(manager.locator("[data-photo-state]")).toHaveCount(0);
  expect(await manager.getByLabel("Texto alternativo").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(["original", "single", "retry", "later"]);
  expect(puts).toBe(3);
  expect(jsonSizes.length).toBeGreaterThan(0);
  expect(jsonSizes.every(size => size < 8192)).toBe(true);

  await photos.last().getByRole("button", { name: "Hacer foto principal", exact: true }).click();
  await expect(photos.first().getByLabel("Texto alternativo")).toHaveValue("later");
  await photos.nth(2).getByRole("button", { name: "Mover foto a la derecha", exact: true }).click();
  await expect(photos.last().getByLabel("Texto alternativo")).toHaveValue("single");
  const persistedOrder = await ids();
  await page.reload();
  expect(await ids()).toEqual(persistedOrder);
  const review = await (await page.request.get(`/api/admin/products/${productId}/review`)).json();
  const primaryUrl = review.images[0].url;
  await page.goto(`/admin/productos?q=${part}`);
  await expect(page.locator('table tbody img').first()).toHaveAttribute("src", new RegExp(encodeURIComponent(primaryUrl).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  await page.goto(editPath!);
  const publication = await page.getByRole("link", { name: "Ver publicación" }).getAttribute("href");
  const catalog = await page.context().newPage();
  try {
    await catalog.goto(publication!);
    await expect(catalog.locator('main img').first()).toBeVisible();
    expect(await catalog.locator('img').evaluateAll((nodes, url) => nodes.some(node => (node as HTMLImageElement).src.includes(encodeURIComponent(url))), primaryUrl)).toBe(true);
  } finally { await catalog.close(); }

  for (const width of info.project.name.startsWith("mobile") ? [393] : [1440, 900]) {
    await page.setViewportSize({ width, height: width === 393 ? 727 : 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await manager.getByRole("button", { name: "+ Agregar fotos", exact: true }).scrollIntoViewIfNeeded();
      const add = manager.getByRole("button", { name: "+ Agregar fotos", exact: true });
      await add.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(add).toBeFocused();
      await expect(add).toHaveCSS("color", "rgb(255, 255, 255)");
      await expect(add).toHaveCSS("background-color", "rgb(45, 111, 234)");
      await expect(add).toHaveCSS("font-size", "14px");
      await expect(add).toHaveCSS("font-weight", "600");
      expect(await add.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe("none");
      const outline = photos.first().getByRole("button", { name: "Guardar alt" });
      await expect(outline).not.toHaveCSS("background-color", "rgb(45, 111, 234)");
      await manager.screenshot({ path: info.outputPath(`photos-${width}-${theme}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await photos.first().getByRole("button", { name: "Ver foto 1" }).click();
      const preview = page.getByRole("dialog", { name: "Fotos del producto", exact: true });
      await expect(preview.getByRole("img").first()).toBeVisible();
      expect(await preview.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`preview-${width}-${theme}.png`) });
      await preview.getByRole("button", { name: "Cerrar ventana" }).click();
    }
  }
  page.once("dialog", dialog => dialog.accept());
  await photos.last().getByRole("button", { name: "Eliminar foto", exact: true }).click();
  await expect(photos).toHaveCount(3);
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByText("Producto actualizado correctamente.")).toBeVisible();
  await page.reload();
  expect(await ids()).toEqual(persistedOrder.slice(0, 3));
});

test("short stock entry and inventory editing persist provenance without changing the product or historical entry", async ({ page }, info) => {
  test.setTimeout(120_000);
  await login(page);
  const pool = new Pool({ connectionString: source!.href });
  try {
    const part = `ENTRY-INFO-${info.project.name}-${Date.now()}`;
    await page.locator("[data-quick-add-trigger]").filter({ visible: true }).first().click();
    const create = page.getByRole("dialog", { name: "Agregar producto al inventario" });
    await create.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
    await goToQuickAddStep(create, 2);
    await create.getByLabel("Número de parte", { exact: true }).fill(part);
    await goToQuickAddStep(create, 5);
    await create.getByRole("button", { name: "Agregar producto", exact: true }).click();
    await expect(create.getByText("Producto agregado correctamente.", { exact: false })).toBeVisible();
    await create.getByRole("button", { name: "Cerrar", exact: true }).click();
    const product = (await pool.query("select * from products where part_number=$1", [part])).rows[0];
    const oldItems = (await pool.query("select * from inventory_items where product_id=$1 order by id", [product.id])).rows;
    await page.locator("[data-quick-add-trigger]").filter({ visible: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
    await dialog.getByLabel("Buscar producto").fill(product.sku);
    await dialog.getByRole("button").filter({ hasText: product.sku }).click();
    await expect(dialog.getByRole("progressbar")).toHaveCount(0);
    await dialog.getByLabel("Cantidad", { exact: true }).fill("3");
    await dialog.getByText("Información adicional (opcional)", { exact: true }).click();
    const origin = `Taller ${info.project.name}`;
    await dialog.getByLabel("Origen", { exact: true }).fill(origin);
    await dialog.getByLabel("Fecha", { exact: true }).fill("2026-10-13");
    await dialog.getByLabel("Notas", { exact: true }).fill("Primera línea.\n¿Reparar? Sí. <b>Texto plano</b>");
    await dialog.getByRole("button", { name: "Agregar 3 al inventario", exact: true }).click();
    await expect(dialog.getByText("Existencias agregadas correctamente.", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    const added = (await pool.query("select *,acquired_at::text as calendar_date from inventory_items where product_id=$1 and acquisition_source=$2", [product.id, origin])).rows[0];
    expect(added).toMatchObject({ quantity: 3, calendar_date: "2026-10-13", notes: "Primera línea.\n¿Reparar? Sí. <b>Texto plano</b>" });
    expect((await pool.query("select * from inventory_items where id=any($1::uuid[]) order by id", [oldItems.map(row => row.id)])).rows).toEqual(oldItems);
    expect((await pool.query("select * from products where id=$1", [product.id])).rows[0]).toEqual(product);
    await page.goto(`/admin/inventario?q=${added.inventory_code}&productId=${product.id}`);
    await page.getByRole("button", { name: `Editar inventario ${product.sku}`, exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Editar inventario" });
    await expect(edit.getByLabel("Origen", { exact: true })).toHaveValue(origin);
    await expect(edit.getByLabel("Fecha", { exact: true })).toHaveValue("2026-10-13");
    await expect(edit.locator("b")).toHaveCount(0);
    await edit.getByLabel("Fecha", { exact: true }).fill("2024-02-29");
    await edit.getByLabel("Notas", { exact: true }).fill("Actualizado.\nSegunda línea.");
    await edit.getByRole("button", { name: "Actualizar datos", exact: true }).click();
    await expect(edit.getByText("Datos del inventario actualizados.")).toBeVisible();
    await edit.getByRole("button", { name: "Cerrar ventana" }).click();
    await page.reload();
    await page.getByRole("button", { name: `Editar inventario ${product.sku}`, exact: true }).click();
    await expect(edit.getByLabel("Origen", { exact: true })).toHaveValue(origin);
    await expect(edit.getByLabel("Fecha", { exact: true })).toHaveValue("2024-02-29");
    await expect(edit.getByLabel("Notas", { exact: true })).toHaveValue("Actualizado.\nSegunda línea.");
    expect((await pool.query("select quantity,acquired_at::text from inventory_items where id=$1", [added.id])).rows[0]).toEqual({ quantity: 3, acquired_at: "2024-02-29" });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await edit.getByLabel("Notas", { exact: true }).scrollIntoViewIfNeeded();
      expect(await edit.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`inventory-information-${theme}.png`) });
    }
  } finally { await pool.end(); }
});
