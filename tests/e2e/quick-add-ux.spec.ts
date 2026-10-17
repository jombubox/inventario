import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { goToQuickAddStep } from "./helpers/quick-add-wizard";
import { testImage } from "./helpers/test-image";

const database = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
test.skip(!database || !["127.0.0.1", "localhost"].includes(database.hostname) || database.pathname !== "/jumbobox_test" || Boolean(process.env.PLAYWRIGHT_BASE_URL), "Disposable local PostgreSQL and fake R2 only.");
test.use({ actionTimeout: 15_000 });
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(process.env.ADMIN_EMAIL ?? "admin@e2e.local");
  await page.getByLabel("Contraseña").fill(process.env.ADMIN_PASSWORD ?? "JombuBox-E2E-Admin-123!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
}
async function saveEdit(page: Page) {
  const saved = page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("/admin/productos/"));
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await saved;
  await expect(page.getByText("Producto actualizado correctamente.")).toBeVisible();
}
async function open(page: Page) {
  await page.locator("[data-quick-add-trigger]").filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
  return dialog;
}
async function overflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  for (const dialog of await page.getByRole("dialog").all()) expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
}

test("autocomplete keyboard, normalization, inline creation, warranty toggle and Usado default survive navigation at all widths", async ({ page }, info) => {
  test.setTimeout(180_000);
  await login(page);
  const dialog = await open(page);
  const brand = dialog.getByLabel("Buscar marca");
  const piece = dialog.getByLabel("Buscar tipo de pieza");
  for (const width of [1440, 900, 393]) {
    await page.setViewportSize({ width, height: width === 393 ? 727 : 900 });
    await brand.fill("  sAmSuNg  ");
    await expect(dialog.getByRole("option", { name: "Samsung", exact: true })).toHaveCount(1);
    await expect(dialog.getByRole("option", { name: /Agregar marca/u })).toHaveCount(0);
    await brand.press("Escape"); await expect(dialog.getByRole("listbox")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await brand.press("Enter"); await expect(dialog.getByText("Paso 1 de 5", { exact: true })).toBeVisible();
    await brand.focus(); await brand.press("ArrowDown"); await brand.press("ArrowUp"); await brand.press("Enter");
    await expect(brand).toHaveValue("Samsung");
    await piece.fill("  MAINBOARD  ");
    const existing = dialog.getByRole("option", { name: /mainboard/iu }).first();
    await piece.press("Escape");
    await expect(dialog.getByRole("listbox")).toHaveCount(0);
    await piece.press("ArrowDown"); await piece.press("ArrowUp"); await piece.press("Enter");
    await piece.focus(); await piece.press("ArrowDown");
    await existing.click();
    await expect(piece).not.toHaveValue("");
    await brand.focus(); await overflow(page); await page.screenshot({ path: info.outputPath(`autocomplete-${width}.png`) });
    await brand.press("Escape");
  }
  const suffix = `${info.project.name}-${Date.now()}`;
  await brand.fill(`Marca UX ${suffix}`);
  await expect(dialog.getByText("No encontramos esta marca.")).toBeVisible();
  await brand.press("Enter"); await expect(dialog.getByText("Se creó la marca.")).toBeVisible();
  await expect(brand).toHaveValue(`Marca UX ${suffix}`);
  await piece.fill(`Pieza UX ${suffix}`);
  await expect(dialog.getByText("No encontramos este tipo de pieza.")).toBeVisible();
  await dialog.getByRole("option", { name: /Agregar tipo de pieza/u }).click();
  await expect(piece).toHaveValue(`Pieza UX ${suffix}`);
  await brand.focus(); // Next must still work while suggestions are open.
  await goToQuickAddStep(dialog, 2);
  await dialog.getByLabel("Número de parte", { exact: true }).fill(`UX-${suffix}`);
  await goToQuickAddStep(dialog, 5);
  await expect(dialog.getByLabel("Condición", { exact: true })).toHaveValue("USED");
  const warranty = dialog.getByLabel("Garantía", { exact: true });
  await expect(warranty).toHaveAttribute("type", "text"); await expect(warranty).toHaveAttribute("inputmode", "numeric");
  for (const invalid of ["abc", "-3", "1.5", "0", "6 meses"]) {
    await warranty.fill(invalid); await dialog.getByRole("button", { name: "Agregar producto", exact: true }).click();
    await expect(dialog.getByText("Escribe un número entero de meses mayor que cero.")).toBeVisible();
    await expect(dialog.getByText("Paso 5 de 5", { exact: true })).toBeVisible();
  }
  for (const months of ["3", "6", "12", "24"]) { await warranty.fill(months); await expect(warranty).toHaveValue(months); }
  await dialog.getByLabel("Sin garantía", { exact: true }).check(); await expect(warranty).toBeDisabled();
  expect(JSON.parse(await dialog.locator('input[name="warrantyInput"]').inputValue())).toEqual({ months: "", noWarranty: true });
  await dialog.getByLabel("Sin garantía", { exact: true }).uncheck(); await expect(warranty).toHaveValue("24");
  for (const width of [1440, 900, 393]) {
    await page.setViewportSize({ width, height: width === 393 ? 727 : 900 });
    await warranty.scrollIntoViewIfNeeded(); await overflow(page); await page.screenshot({ path: info.outputPath(`warranty-${width}.png`) });
  }
  await goToQuickAddStep(dialog, 1);
  await expect(brand).toHaveValue(`Marca UX ${suffix}`); await expect(piece).toHaveValue(`Pieza UX ${suffix}`);
  await goToQuickAddStep(dialog, 5); await expect(warranty).toHaveValue("24");
  await warranty.fill("6"); await dialog.getByRole("button", { name: "Agregar producto", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Producto agregado correctamente", exact: true })).toBeVisible();
  const pool = new Pool({ connectionString: database!.href });
  try {
    const product = (await pool.query("select * from products where part_number=$1", [`UX-${suffix}`])).rows[0];
    expect(product).toMatchObject({ condition: "USED", warranty: "6 meses" });
    await page.goto(`/admin/productos/${product.id}`);
    await expect(page.getByLabel("Garantía", { exact: true })).toHaveValue("6");
    await expect(page.getByLabel("Condición", { exact: true })).toHaveValue("USED");
    await page.getByLabel("Sin garantía", { exact: true }).check();
    await page.getByLabel("Condición", { exact: true }).selectOption("NEW");
    await saveEdit(page); await page.reload();
    await expect(page.getByLabel("Sin garantía", { exact: true })).toBeChecked();
    await expect(page.getByLabel("Condición", { exact: true })).toHaveValue("NEW");
    await page.goto(`/catalogo/${product.slug}`);
    await expect(page.locator("dl").getByText("Sin garantía", { exact: true })).toBeVisible();
    await expect(page.locator("dl").getByText("Nuevo", { exact: true })).toBeVisible();
    await pool.query("update products set warranty=' 30   días ',condition=null where id=$1", [product.id]);
    await page.goto(`/admin/productos/${product.id}`);
    await expect(page.getByText(/Garantía registrada:.*30\s+días/u)).toBeVisible();
    await saveEdit(page);
    expect((await pool.query("select warranty,condition from products where id=$1", [product.id])).rows[0]).toEqual({ warranty: " 30   días ", condition: null });
    await page.getByRole("button", { name: "Cambiar garantía", exact: true }).click();
    await page.getByLabel("Garantía", { exact: true }).fill("12");
    await saveEdit(page); await page.reload();
    await expect(page.getByLabel("Garantía", { exact: true })).toHaveValue("12");
  } finally { await pool.end(); }
});

test("product preview loads one original on demand and links exact stock with locations, pagination, reset and zero stock", async ({ page, request }, info) => {
  test.setTimeout(180_000);
  const pool = new Pool({ connectionString: database!.href });
  const suffix = `${info.project.name}-${Date.now()}`.toUpperCase();
  try {
    const product = (await pool.query("insert into products(sku,slug,title,brand_id,component_type_id,part_number,normalized_part_number,status) select $1,$2,$3,brand_id,component_type_id,$1,regexp_replace($1,'[^A-Z0-9]','','g'),'ACTIVE' from products where sku='SAM-MB-BN9407820F' returning *", [`UX-${suffix}`, `ux-${suffix.toLowerCase()}`, `Producto UX ${suffix}`])).rows[0];
    const empty = (await pool.query("insert into products(sku,slug,title,brand_id,component_type_id) values($1,$2,$3,$4,$5) returning *", [`ZERO-${suffix}`, `zero-${suffix.toLowerCase()}`, `Sin stock UX ${suffix}`, product.brand_id, product.component_type_id])).rows[0];
    const warehouse = (await pool.query("insert into locations(code,name,type) values($1,'Almacén UX','WAREHOUSE') returning id", [`WH-${suffix}`])).rows[0].id;
    const boxes = (await pool.query("insert into locations(code,name,type,parent_id) values($1,'Caja UX 1','BOX',$3),($2,'Caja UX 2','BOX',$3) returning id", [`B1-${suffix}`, `B2-${suffix}`, warehouse])).rows;
    for (let n = 0; n < 22; n++) await pool.query("insert into inventory_items(product_id,location_id,quantity,legacy_bag_number,status) values($1,$2,2,$3,$4)", [product.id, boxes[n % 2].id, n === 0 ? "4" : null, n === 21 ? "RESERVED" : "AVAILABLE"]);
    const keys = [0, 1].map(() => `products/${product.id}/${crypto.randomUUID()}.png`);
    const urls = keys.map(key => `http://127.0.0.1:5555/jombubox-e2e/${key}`);
    for (let n = 0; n < 2; n++) {
      await request.put(urls[n]!, { headers: { Authorization: "local-fixture", "Content-Type": "image/png" }, data: testImage(2400, 1800) });
      await pool.query("insert into product_images(product_id,provider,storage_key,alt,is_primary,sort_order) values($1,'R2',$2,$3,$4,$5)", [product.id, keys[n], `Foto ${n}`, n === 0, n]);
    }
    await login(page);
    const originals: string[] = []; const mutations: string[] = [];
    page.on("request", req => { if (urls.includes(req.url())) { originals.push(req.url()); if (req.method() !== "GET") mutations.push(req.method()); } });
    await page.goto(`/admin/productos?q=${product.sku}`);
    const trigger = page.getByRole("button", { name: `Ver fotos de ${product.title}` });
    await expect(trigger.locator("img")).toHaveAttribute("src", /\/_next\/image\?/u);
    expect(originals).toHaveLength(0);
    await trigger.click(); const viewer = page.getByRole("dialog", { name: "Fotos del producto" });
    const original = viewer.locator("[data-product-zoom] img");
    await expect(original).toHaveAttribute("src", urls[0]!);
    await expect.poll(() => original.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2400);
    expect(originals).toEqual([urls[0]]);
    await expect(viewer.getByText("Disponible en inventario · 42 piezas")).toBeVisible();
    for (const width of [1440, 900, 393]) {
      await page.setViewportSize({ width, height: width === 393 ? 727 : 900 });
      await overflow(page); await page.screenshot({ path: info.outputPath(`original-${width}.png`) });
    }
    if (!info.project.name.startsWith("mobile")) {
      await page.setViewportSize({ width: 1440, height: 900 }); await original.hover();
      await expect(viewer.locator("[data-product-zoom]")).toHaveCSS("transform", "matrix(2.25, 0, 0, 2.25, 0, 0)");
      await page.mouse.move(0, 0);
      await expect(viewer.locator("[data-product-zoom]")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
    } else { await original.tap(); expect(await viewer.locator("[data-product-zoom]").evaluate(el => (el as HTMLElement).style.transform)).not.toBe("scale(2.25)"); }
    await viewer.getByRole("button", { name: "Cerrar ventana" }).click();
    await trigger.click(); await expect(original).toHaveAttribute("src", urls[0]!);
    await viewer.getByRole("button", { name: "Siguiente", exact: true }).click(); await expect(original).toHaveAttribute("src", urls[1]!);
    expect(originals.every(url => urls.includes(url))).toBe(true); expect(mutations).toEqual([]);
    await viewer.getByRole("link", { name: "Buscar en inventario", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`productId=${product.id}`, "u"));
    await expect(page.getByText(`Producto: ${product.title}`)).toBeVisible();
    await expect(page.locator("article")).toHaveCount(20);
    expect(await page.locator("[data-inventory-sku]").allTextContents()).toEqual(Array(20).fill(product.sku));
    await page.getByRole("link", { name: "Siguiente", exact: true }).click(); await expect(page).toHaveURL(/page=2/u);
    await expect(page.locator("article")).toHaveCount(2); await expect(page.getByText("Bolsa 4", { exact: true })).toBeVisible();
    await page.reload(); await expect(page).toHaveURL(new RegExp(`productId=${product.id}`, "u"));
    const filter = page.getByRole("combobox", { name: "Estado", exact: true });
    await filter.selectOption("RESERVED"); await expect(page.locator("article")).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`productId=${product.id}`, "u")); await expect(page).not.toHaveURL(/page=2/u);
    for (const width of [1440, 900, 393]) { await page.setViewportSize({ width, height: width === 393 ? 727 : 900 }); await overflow(page); await page.screenshot({ path: info.outputPath(`inventory-${width}.png`) }); }
    await page.getByRole("link", { name: "Quitar filtro", exact: true }).click(); await expect(page).not.toHaveURL(/productId=/u);
    await page.goto(`/admin/inventario?productId=${empty.id}`);
    await expect(page.getByText("Este producto no tiene existencias registradas.")).toBeVisible();
    await page.goto("/admin/inventario?productId=invalid"); await expect(page.getByText("El filtro de inventario no es válido.")).toBeVisible();
    await page.goto(`/admin/productos?q=${product.sku}`); await trigger.click();
    await page.route(urls[1]!, route => route.abort());
    await viewer.getByRole("button", { name: "Siguiente", exact: true }).click();
    await expect(viewer.getByText("No fue posible cargar la foto original.")).toBeVisible();
    const anonymous = await page.context().browser()!.newContext();
    try { const anon = await anonymous.newPage(); await anon.goto(`/admin/inventario?productId=${product.id}`); await expect(anon).toHaveURL(/\/login/u); } finally { await anonymous.close(); }
  } finally { await pool.end(); }
});
