import { expect, test, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";
import { testImage } from "./helpers/test-image";
import { goToQuickAddStep } from "./helpers/quick-add-wizard";

const source = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
const local = source && ["localhost", "127.0.0.1"].includes(source.hostname) && source.pathname === "/jumbobox_test";
test.skip(!local || Boolean(process.env.PLAYWRIGHT_BASE_URL), "Disposable local database and fake R2 only.");
test.use({ actionTimeout: 15_000 });

async function open(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("admin@e2e.local");
  await page.getByLabel("Contraseña").fill("JombuBox-E2E-Admin-123!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
  const trigger = page.locator("[data-quick-add-trigger]").filter({ visible: true }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
  return { dialog, trigger };
}
async function step(dialog: Locator, number: number) {
  await expect(dialog.getByText(`Paso ${number} de 5`, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(number));
}

test("five-step navigation validates, preserves all fields, submits once and resets completely", async ({ page }, info) => {
  test.setTimeout(180_000);
  const mobile = info.project.name.startsWith("mobile");
  await page.setViewportSize(mobile ? { width: 393, height: 727 } : { width: 1440, height: 900 });
  const suffix = `${info.project.name}-${Date.now()}`;
  const part = `WIZARD-${suffix}`;
  const pool = new Pool({ connectionString: source!.href });
  try {
    await pool.query("delete from operational_rate_limits where key in ('image-upload:admin','image-confirm:admin','image-mutation:admin')");
    let imageRequests = 0;
    page.on("request", request => { if (/\/api\/products\/images\/(upload|confirm)/u.test(request.url())) imageRequests++; });
    const { dialog } = await open(page);
    await step(dialog, 1);
    await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
    await step(dialog, 1);
    await expect(dialog.getByText("Selecciona una marca.", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Selecciona un tipo de pieza.", { exact: true })).toBeVisible();
    await expect(dialog.locator("#quick-brand")).toBeFocused();
    await dialog.getByRole("button", { name: /Agregar nueva marca/u }).click();
    await dialog.getByLabel("Nueva marca").fill(`Marca ${suffix}`);
    await dialog.getByRole("button", { name: "Guardar marca", exact: true }).click();
    await expect(dialog.getByText("Se creó la marca.")).toBeVisible();
    const brandId = await dialog.locator("#quick-brand").inputValue();
    await dialog.getByRole("button", { name: /Agregar tipo de pieza/u }).click();
    await dialog.getByLabel("Nuevo tipo de pieza").fill(`Pieza ${suffix}`);
    await dialog.getByRole("button", { name: "Guardar tipo de pieza", exact: true }).click();
    await expect(dialog.getByText("Se creó el tipo de pieza.")).toBeVisible();
    const typeId = await dialog.locator("#quick-componentType").inputValue();
    await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
    await step(dialog, 2);
    await expect(dialog.getByRole("heading", { name: "Identificación del producto" })).toBeFocused();
    await dialog.getByLabel("Nombre del producto").fill(`Fuente ${suffix}`);
    await dialog.getByLabel("Número de parte", { exact: true }).fill(part);
    await dialog.getByLabel("Número de serie principal (opcional)").fill("PRIMARY-1");
    await dialog.getByRole("button", { name: "Agregar número de serie secundario" }).click();
    await dialog.getByRole("textbox", { name: "Número de serie secundario 1", exact: true }).fill("primary-1");
    await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
    await step(dialog, 2);
    await expect(dialog.getByText(/está repetido dentro/u)).toBeVisible();
    await dialog.getByRole("textbox", { name: "Número de serie secundario 1", exact: true }).fill("SECOND-1");
    await dialog.getByLabel("Número de parte", { exact: true }).press("Enter");
    await step(dialog, 2);
    await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
    await step(dialog, 3);
    for (const model of ["TV-ONE", "TV-TWO", "TV-THREE"]) {
      await dialog.getByLabel("Buscar modelo compatible").fill(model);
      await dialog.getByRole("option", { name: new RegExp(`Agregar modelo.*${model}`, "u") }).click();
    }
    await expect(dialog.getByRole("listitem")).toHaveCount(3);
    await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
    await step(dialog, 4);
    await expect(dialog.getByRole("button", { name: "+ Agregar fotos", exact: true })).toBeVisible();
    await dialog.getByLabel(/Agregar fotos/u).setInputFiles(["one", "two", "three"].map(name => ({ name: `${name}.png`, mimeType: "image/png", buffer: testImage() })));
    await expect(dialog.locator("[data-photo-state]")).toHaveCount(3);
    await dialog.getByRole("button", { name: "Hacer foto principal: three.png", exact: true }).click();
    await dialog.getByRole("button", { name: "Mover foto a la derecha: one.png", exact: true }).click();
    await expect(dialog.locator("[data-photo-state]").first()).toContainText("three.png");
    await page.screenshot({ path: info.outputPath("step-4-photos.png") });
    await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
    await step(dialog, 5);
    await dialog.getByLabel("Precio de venta").fill("1250.01");
    await dialog.getByLabel("Garantía (opcional)").fill("30 días");
    await dialog.getByLabel("Condición", { exact: true }).selectOption("USED");
    await dialog.getByLabel("Cantidad de piezas").fill("5");
    await expect(dialog.getByText("Disponibilidad: Disponible", { exact: true })).toBeVisible();
    await dialog.getByLabel("Bolsa (opcional)").fill("Bolsa 3");
    await dialog.getByRole("button", { name: /Agregar ubicación/u }).click();
    await dialog.getByLabel("Código de ubicación").fill(`WH-${suffix}`);
    await dialog.getByLabel("Nombre de ubicación").fill(`Almacén ${suffix}`);
    await dialog.getByRole("button", { name: "Guardar ubicación", exact: true }).click();
    await expect(dialog.getByLabel("Ubicación", { exact: true }).locator("option:checked")).toHaveText(`Almacén ${suffix}`);
    const locationId = await dialog.getByLabel("Ubicación", { exact: true }).inputValue();
    await dialog.getByRole("button", { name: /Crear caja/u }).click();
    await dialog.getByLabel("Código", { exact: true }).fill(`BOX-${suffix}`);
    await dialog.getByLabel("Nombre", { exact: true }).fill("Caja 18");
    await dialog.getByLabel("Cantidad de piezas").fill("1.5");
    await dialog.getByRole("button", { name: "Agregar producto", exact: true }).click();
    await step(dialog, 5);
    await expect(dialog.getByText("La cantidad debe ser un número entero.")).toBeVisible();
    await dialog.getByLabel("Cantidad de piezas").fill("5");
    for (let number = 4; number >= 1; number--) {
      await dialog.getByRole("button", { name: "Atrás", exact: true }).click();
      await step(dialog, number);
      if (number === 4) {
        await expect(dialog.locator("[data-photo-state]")).toHaveCount(3);
        await expect(dialog.locator("[data-photo-state]").first()).toContainText("three.png");
      }
      if (number === 3) await expect(dialog.getByRole("listitem")).toHaveCount(3);
      if (number === 2) {
        await expect(dialog.getByLabel("Número de parte", { exact: true })).toHaveValue(part);
        await expect(dialog.getByLabel("Nombre del producto")).toHaveValue(`Fuente ${suffix}`);
        // A newly mounted serial editor must not reuse its previous row IDs.
        await dialog.getByRole("button", { name: "Agregar número de serie secundario" }).click();
        await dialog.getByRole("textbox", { name: "Número de serie secundario 2", exact: true }).fill("SECOND-2");
      }
      if (number === 1) {
        await expect(dialog.locator("#quick-brand")).toHaveValue(brandId);
        await expect(dialog.locator("#quick-componentType")).toHaveValue(typeId);
      }
    }
    await goToQuickAddStep(dialog, 5);
    for (const [label, value] of [["Precio de venta", "1250.01"], ["Garantía (opcional)", "30 días"], ["Cantidad de piezas", "5"], ["Bolsa (opcional)", "Bolsa 3"], ["Código", `BOX-${suffix}`], ["Nombre", "Caja 18"]]) {
      await expect(dialog.getByLabel(label!, { exact: true })).toHaveValue(value!);
    }
    await expect(dialog.getByLabel("Ubicación", { exact: true })).toHaveValue(locationId);
    await expect(dialog.getByLabel("Condición", { exact: true })).toHaveValue("USED");
    expect((await pool.query("select count(*)::int as count from products where part_number=$1", [part])).rows[0].count).toBe(0);
    expect((await pool.query("select count(*)::int as count from locations where code=$1", [`BOX-${suffix}`])).rows[0].count).toBe(0);
    expect(imageRequests).toBe(0);
    await page.screenshot({ path: info.outputPath("step-5-confirmation.png") });
    await dialog.getByRole("button", { name: "Agregar producto", exact: true }).click();
    await expect(dialog.getByText("Las fotos se guardaron correctamente.")).toBeVisible({ timeout: 30_000 });
    const rows = (await pool.query("select * from products where part_number=$1", [part])).rows;
    expect(rows).toHaveLength(1);
    const product = rows[0];
    expect(product).toMatchObject({ brand_id: brandId, component_type_id: typeId, title: `Fuente ${suffix}`, sale_price: "1250.01", warranty: "30 días", currency: "MXN", condition: "USED", status: "ACTIVE", is_public: true });
    expect((await pool.query("select serial_number from product_serial_numbers where product_id=$1", [product.id])).rows.map(row => row.serial_number)).toEqual(expect.arrayContaining(["PRIMARY-1", "SECOND-1", "SECOND-2"]));
    expect((await pool.query("select * from product_compatibilities where product_id=$1", [product.id])).rows).toHaveLength(3);
    expect((await pool.query("select i.quantity,i.legacy_bag_number,l.code,l.parent_id from inventory_items i join locations l on l.id=i.location_id where i.product_id=$1", [product.id])).rows).toEqual([{ quantity: 5, legacy_bag_number: "Bolsa 3", code: `BOX-${suffix}`, parent_id: locationId }]);
    expect((await pool.query("select alt,is_primary,sort_order from product_images where product_id=$1 order by sort_order", [product.id])).rows).toEqual([{ alt: "three", is_primary: true, sort_order: 0 }, { alt: "two", is_primary: false, sort_order: 1 }, { alt: "one", is_primary: false, sort_order: 2 }]);
    await expect(dialog.getByRole("link", { name: "Ver publicación" })).toBeVisible();
    const publicPath = await dialog.getByRole("link", { name: "Ver publicación" }).getAttribute("href");
    const reviewPage = await page.context().newPage();
    try {
      await reviewPage.goto(publicPath!);
      await expect(reviewPage.locator("dl").getByText("30 días", { exact: true })).toBeVisible();
      await reviewPage.goto(`/admin/productos/${product.id}`);
      await expect(reviewPage.getByLabel("Garantía (opcional)")).toHaveValue("30 días");
      await reviewPage.getByLabel("Garantía (opcional)").fill("90 días");
      await reviewPage.getByRole("button", { name: "Guardar cambios", exact: true }).click();
      await expect(reviewPage.getByText("Producto actualizado correctamente.")).toBeVisible();
      await reviewPage.reload();
      await expect(reviewPage.getByLabel("Garantía (opcional)")).toHaveValue("90 días");
      await reviewPage.goto(publicPath!);
      await expect(reviewPage.locator("dl").getByText("90 días", { exact: true })).toBeVisible();
    } finally { await reviewPage.close(); }
    await dialog.getByRole("button", { name: "Agregar otro producto" }).click();
    await step(dialog, 1);
    await expect(dialog.locator("#quick-brand")).toHaveValue("");
    await expect(dialog.locator("#quick-componentType")).toHaveValue("");
    await goToQuickAddStep(dialog, 2);
    await expect(dialog.getByLabel("Número de parte", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("Número de serie principal (opcional)")).toHaveValue("");
    await expect(dialog.getByRole("textbox", { name: /^Número de serie secundario/u })).toHaveCount(0);
    await goToQuickAddStep(dialog, 3);
    await expect(dialog.getByRole("listitem")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
    await step(dialog, 3); // identity still required even though models usually are optional
    await expect(dialog.getByText(/Agrega un modelo compatible o vuelve/u)).toBeVisible();
    await goToQuickAddStep(dialog, 2);
    await dialog.getByLabel("Número de parte", { exact: true }).fill("RESET-CHECK");
    await goToQuickAddStep(dialog, 4);
    await expect(dialog.locator("[data-photo-state]")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
    await expect(dialog.getByLabel("Ubicación", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("Cantidad de piezas")).toHaveValue("1");
    await expect(dialog.getByLabel("Precio de venta")).toHaveValue("");
    await expect(dialog.getByLabel("Garantía (opcional)")).toHaveValue("");
    await expect(dialog.getByLabel("Bolsa (opcional)")).toHaveValue("");
  } finally { await pool.end(); }
});

for (const size of [{ width: 1440, height: 900 }, { width: 900, height: 900 }, { width: 393, height: 727 }]) {
  test(`wizard layout, theme, focus and cancellation at ${size.width}×${size.height}`, async ({ page }, info) => {
    test.skip(info.project.name.startsWith("mobile") !== (size.width === 393), "Use the matching device project.");
    test.setTimeout(90_000);
    await page.setViewportSize(size);
    const { dialog, trigger } = await open(page);
    await expect(dialog.getByRole("heading", { name: "Marca y tipo de pieza" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
    await goToQuickAddStep(dialog, 2);
    await dialog.getByLabel("Número de parte", { exact: true }).fill("LAYOUT-UNSAVED");
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; document.documentElement.classList.toggle("dark", value === "dark"); }, theme);
      for (let number = 1; number <= 5; number++) {
        await goToQuickAddStep(dialog, number); await step(dialog, number);
        expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
        await expect(dialog.getByRole("button", { name: number === 5 ? "Agregar producto" : "Siguiente", exact: true })).toBeInViewport();
        await expect(dialog.getByRole("heading").first()).toBeInViewport();
        await page.screenshot({ path: info.outputPath(`${theme}-step-${number}.png`) });
      }
    }
    // A smaller visible viewport models the space available with an on-screen keyboard.
    if (size.width === 393) {
      await page.setViewportSize({ width: 393, height: 450 });
      await dialog.getByLabel("Precio de venta").focus();
      await expect(dialog.getByRole("button", { name: "Agregar producto", exact: true })).toBeInViewport();
      await page.screenshot({ path: info.outputPath("keyboard-space.png") });
      await page.setViewportSize(size);
      // Mobile keyboards can shrink only the visual viewport, keeping layout height unchanged.
      await page.evaluate(() => {
        Object.defineProperty(visualViewport!, "height", { configurable: true, value: 450 });
        Object.defineProperty(visualViewport!, "offsetTop", { configurable: true, value: 70 });
        visualViewport!.dispatchEvent(new Event("resize"));
      });
      await expect(dialog).toHaveCSS("height", "450px");
      const action = (await dialog.getByRole("button", { name: "Agregar producto", exact: true }).boundingBox())!;
      expect(action.y + action.height).toBeLessThanOrEqual(520);
      expect((await dialog.boundingBox())!.y).toBe(70);
      await page.screenshot({ path: info.outputPath("keyboard-visual-viewport.png") });
      await page.evaluate(() => {
        Reflect.deleteProperty(visualViewport!, "height");
        Reflect.deleteProperty(visualViewport!, "offsetTop");
        visualViewport!.dispatchEvent(new Event("resize"));
      });
    }
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("alertdialog")).toBeVisible();
    await dialog.getByRole("button", { name: "Seguir editando" }).click();
    await expect(dialog.getByLabel("Número de parte", { exact: true })).toHaveCount(0);
    await goToQuickAddStep(dialog, 2);
    await expect(dialog.getByLabel("Número de parte", { exact: true })).toHaveValue("LAYOUT-UNSAVED");
    for (let index = 0; index < 15; index++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Descartar y cerrar" }).click();
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  });
}

test("stale brand, piece type, model, location and box return a useful error without committing", async ({ page }, info) => {
  test.setTimeout(180_000);
  const { dialog } = await open(page);
  await goToQuickAddStep(dialog, 2);
  const suffix = `${info.project.name}-${Date.now()}`;
  const part = `STALE-${suffix}`;
  await dialog.getByLabel("Número de parte", { exact: true }).fill(part);
  await goToQuickAddStep(dialog, 3);
  await dialog.getByLabel("Marca del modelo compatible").selectOption({ label: "Samsung" });
  await dialog.getByLabel("Buscar modelo compatible").fill("UN55NU7100");
  await dialog.getByRole("option", { name: /Samsung UN55NU7100FXZX/u }).click();
  await goToQuickAddStep(dialog, 5);
  await dialog.getByLabel("Ubicación", { exact: true }).selectOption({ label: "Almacén E2E" });
  const brand = await dialog.locator('[name="brandId"]').inputValue();
  const type = await dialog.locator('[name="componentTypeId"]').inputValue();
  const location = await dialog.getByLabel("Ubicación", { exact: true }).inputValue();
  const box = await dialog.getByLabel("Caja", { exact: true }).inputValue();
  const pool = new Pool({ connectionString: source!.href });
  try {
    const modelBrand = (await pool.query("select id from brands where name='Samsung'")).rows[0].id;
    for (const [table, id, destination, message] of [
      ["brands", brand, 1, /marca.*inactiva/u],
      ["component_types", type, 1, /tipo de pieza.*inactivo/u],
      ["brands", modelBrand, 3, /modelos compatibles.*inactiva/u],
      ["locations", location, 5, /ubicación.*inactiva/u],
      ["locations", box, 5, /caja cambió/u],
    ] as const) {
      await pool.query(`update ${table} set active=false where id=$1`, [id]);
      try {
        await goToQuickAddStep(dialog, 5);
        await dialog.getByRole("button", { name: "Agregar producto", exact: true }).click();
        await step(dialog, destination);
        await expect(dialog.getByRole("alert").filter({ hasText: message })).toBeVisible();
        expect((await pool.query("select count(*)::int as count from products where part_number=$1", [part])).rows[0].count).toBe(0);
      } finally { await pool.query(`update ${table} set active=true where id=$1`, [id]); }
    }
  } finally { await pool.end(); }
});
