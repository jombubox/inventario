import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { testImage } from "./helpers/test-image";

const testUrl = process.env.TEST_DATABASE_URL;
const local = testUrl ? new URL(testUrl) : null;
test.skip(!local || !["127.0.0.1", "localhost"].includes(local.hostname) || local.pathname !== "/jumbobox_test", "Requires disposable local jumbobox_test.");
test.use({ actionTimeout: 15_000 });

async function open(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("admin@e2e.local");
  await page.getByLabel("Contraseña").fill("JombuBox-E2E-Admin-123!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
  await page.locator("[data-quick-add-trigger]").filter({ visible: true }).first().click();
  return page.getByRole("dialog", { name: "Agregar producto al inventario" });
}

test("existing stock ignores abandoned product fields, increments the same identity and preserves other boxes", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const pool = new Pool({ connectionString: testUrl });
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  try {
    const product = (await pool.query("select * from products where sku = 'LG-PSU-EAY123456'")).rows[0];
    const parent = (await pool.query("insert into locations(code,name,type,active) values ($1,$2,'WAREHOUSE',true) returning id", [`REG-WH-${suffix}`, `Almacén ${suffix}`])).rows[0];
    const boxA = (await pool.query("insert into locations(code,name,type,parent_id,active) values ($1,$2,'BOX',$3,true) returning id", [`REG-A-${suffix}`, `Caja A ${suffix}`, parent.id])).rows[0];
    const boxB = (await pool.query("insert into locations(code,name,type,parent_id,active) values ($1,$2,'BOX',$3,true) returning id", [`REG-B-${suffix}`, `Caja B ${suffix}`, parent.id])).rows[0];
    await pool.query("insert into inventory_items(product_id,location_id,quantity,condition,status,legacy_bag_number) values ($1,$2,5,'UNKNOWN','AVAILABLE','Bolsa 2')", [product.id, boxA.id]);
    let uploads = 0;
    page.on("request", request => { if (/\/api\/products\/images\/(upload|confirm)/u.test(request.url())) uploads++; });
    let dialog = await open(page);
    await dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
    await dialog.getByLabel("Precio de venta").fill("-1");
    await dialog.getByRole("button", { name: "← Volver a buscar" }).click();
    await dialog.getByLabel("Buscar producto").fill("EAY123456");
    await dialog.getByRole("button").filter({ hasText: "LG-PSU-EAY123456" }).click();
    for (const label of ["Marca", "Tipo de pieza", "Precio de venta", "Condición", "Estado", "Número de parte", "Buscar modelo compatible"]) {
      await expect(dialog.getByLabel(label, { exact: true })).toHaveCount(0);
    }
    await expect(dialog.locator('[name="salePrice"], [name="condition"], [name="compatibilities"]')).toHaveCount(0);
    await dialog.getByLabel("Ubicación", { exact: true }).selectOption(parent.id);
    await dialog.getByLabel("Caja", { exact: true }).selectOption(boxA.id);
    await dialog.getByLabel("Bolsa (opcional)").fill(" bolsa   2 ");
    await dialog.getByLabel("Cantidad", { exact: true }).fill("3");
    await dialog.getByRole("button", { name: "Agregar 3 al inventario" }).click();
    await expect(dialog.getByRole("heading", { name: "Existencias agregadas correctamente" })).toBeVisible();
    await expect(dialog.getByRole("status")).toContainText(`Caja A ${suffix}`);
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.locator("[data-quick-add-trigger]").filter({ visible: true }).first().click();
    dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
    await dialog.getByLabel("Buscar producto").fill("EAY123456");
    await dialog.getByRole("button").filter({ hasText: "LG-PSU-EAY123456" }).click();
    await dialog.getByLabel("Ubicación", { exact: true }).selectOption(parent.id);
    await dialog.getByLabel("Caja", { exact: true }).selectOption(boxB.id);
    await dialog.getByLabel("Cantidad", { exact: true }).fill("3");
    await dialog.getByRole("button", { name: "Agregar 3 al inventario" }).click();
    await expect(dialog.getByRole("heading", { name: "Existencias agregadas correctamente" })).toBeVisible();
    const stock = (await pool.query("select location_id,quantity from inventory_items where product_id=$1 and location_id=any($2::uuid[])", [product.id, [boxA.id, boxB.id]])).rows;
    expect(stock).toHaveLength(2);
    expect(stock).toEqual(expect.arrayContaining([{ location_id: boxA.id, quantity: 8 }, { location_id: boxB.id, quantity: 3 }]));
    expect((await pool.query("select * from products where id=$1", [product.id])).rows[0]).toEqual(product);
    expect((await pool.query("select m.type,m.quantity from inventory_movements m join inventory_items i on i.id=m.inventory_item_id where i.location_id=any($1::uuid[])", [[boxA.id, boxB.id]])).rows).toEqual(expect.arrayContaining([{ type: "IN", quantity: 3 }, { type: "INITIAL", quantity: 3 }]));
    expect(uploads).toBe(0);
  } finally {
    await pool.end();
  }
});

test("new product adds a missing brand/model inline, preserves fields and persists compatibility after reload", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const part = `MODEL-REG-${suffix}`;
  const model = `75H78G-${suffix}`;
  const pool = new Pool({ connectionString: testUrl });
  try {
    const dialog = await open(page);
    await dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
    await dialog.getByLabel("Número de parte", { exact: true }).fill(part);
    await dialog.getByLabel("Número de serie principal (opcional)").fill(`SERIAL-${suffix}`);
    await dialog.getByLabel("Precio de venta").fill("1250.01");
    await dialog.getByLabel("Condición", { exact: true }).selectOption("USED");
    await dialog.getByLabel(/Agregar fotos/u).setInputFiles({ name: "modelo.png", mimeType: "image/png", buffer: testImage() });
    const search = dialog.getByLabel("Buscar modelo compatible");
    await dialog.getByLabel("Marca del modelo compatible").selectOption({ label: "Samsung" });
    await search.fill("UN55NU7100");
    await dialog.getByRole("option", { name: /Samsung UN55NU7100FXZX/u }).click();
    await search.fill(`Hisense   ${model}`);
    await expect(dialog.getByLabel("Marca del modelo compatible")).toHaveValue(await dialog.getByLabel("Marca del modelo compatible").locator('option', { hasText: /^Hisense$/u }).getAttribute("value") ?? "");
    await expect(dialog.getByText("No encontramos este modelo.", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("option", { name: `+ Agregar modelo “Hisense ${model}”`, exact: true })).toBeVisible();
    await search.press("Enter");
    const selected = dialog.getByRole("list", { name: "Modelos compatibles seleccionados" });
    await expect(selected.getByRole("listitem")).toHaveCount(2);
    await expect(selected).toContainText(`Hisense ${model}`);
    await search.fill(` HISENSE  ${model.toLowerCase()} `);
    await expect(dialog.getByText("Los modelos encontrados ya están seleccionados.", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("option", { name: /Agregar modelo/u })).toHaveCount(0);
    await expect(dialog.getByLabel("Número de parte", { exact: true })).toHaveValue(part);
    await expect(dialog.getByLabel("Precio de venta")).toHaveValue("1250.01");
    await expect(dialog.getByRole("button", { name: "Eliminar foto: modelo.png" })).toBeVisible();
    await dialog.getByRole("button", { name: "Continuar con ubicación" }).click();
    await dialog.getByLabel("Ubicación", { exact: true }).selectOption({ label: "Almacén E2E" });
    await dialog.getByLabel("Cantidad", { exact: true }).fill("3");
    await dialog.getByRole("button", { name: "Guardar producto" }).click();
    await expect(dialog.getByText("Las fotos se guardaron correctamente.")).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole("link", { name: "Ver publicación" })).toHaveAttribute("href", /^\/catalogo\//u);
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.goto(`/admin/productos?q=${part}`);
    await page.getByRole("row").filter({ hasText: part }).getByRole("link", { name: "Editar" }).click();
    await expect(page).toHaveURL(/\/admin\/productos\/[0-9a-f-]+$/u);
    await expect(page.getByRole("list", { name: "Modelos compatibles seleccionados" })).toContainText(model);
    await page.reload();
    await expect(page.getByRole("list", { name: "Modelos compatibles seleccionados" })).toContainText(model);
    const product = (await pool.query("select * from products where part_number=$1", [part])).rows[0];
    expect(product).toMatchObject({ sale_price: "1250.01", currency: "MXN", condition: "USED", status: "ACTIVE", is_public: true });
    expect((await pool.query("select b.name,pc.model from product_compatibilities pc join brands b on b.id=pc.brand_id where pc.product_id=$1", [product.id])).rows).toEqual(expect.arrayContaining([{ name: "Hisense", model }]));
    expect((await pool.query("select quantity from inventory_items where product_id=$1", [product.id])).rows).toEqual([{ quantity: 3 }]);
    expect((await pool.query("select is_primary,sort_order from product_images where product_id=$1", [product.id])).rows).toEqual([{ is_primary: true, sort_order: 0 }]);
  } finally {
    await pool.end();
  }
});
