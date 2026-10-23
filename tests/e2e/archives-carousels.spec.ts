import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const localDb = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
test.skip(!localDb || !["127.0.0.1", "localhost"].includes(localDb.hostname) || localDb.pathname !== "/jumbobox_test", "Requires disposable local jumbobox_test.");

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(process.env.ADMIN_EMAIL ?? "admin@e2e.local");
  await page.getByLabel("Contraseña").fill(process.env.ADMIN_PASSWORD ?? "JombuBox-E2E-Admin-123!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
}

test("logo carousels preserve artwork, support navigation and fit all themes and sizes", async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const size of [{ width: 1440, height: 900 }, { width: 900, height: 900 }, { width: 393, height: 727 }]) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"]) {
      await page.addInitScript((value) => localStorage.setItem("jombubox-theme", value), theme);
      await page.goto("/");
      const electronics = page.getByRole("region", { name: "Marcas de electrónicos", exact: true });
      const shipping = page.getByRole("region", { name: "Paqueterías", exact: true });
      await expect(electronics.getByRole("img")).toHaveCount(12);
      await expect(shipping.getByRole("img")).toHaveCount(3);
      for (const section of [electronics, shipping]) {
        const list = section.getByRole("list");
        await list.scrollIntoViewIfNeeded();
        await list.locator("img").evaluateAll(async (images) => { await Promise.all(images.map((image) => (image as HTMLImageElement).decode())); });
        expect(await list.locator("img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
        const next = section.getByRole("button", { name: /Siguiente/u });
        if (await next.isEnabled()) {
          await next.click();
          await expect.poll(() => list.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
          await list.focus(); await page.keyboard.press("Home");
          await expect.poll(() => list.evaluate((element) => element.scrollLeft)).toBe(0);
          await page.keyboard.press("ArrowRight");
          await expect.poll(() => list.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
          await page.keyboard.press("Home");
        }
      }
      if (size.width === 393 && testInfo.project.name.startsWith("mobile")) {
        const list = electronics.getByRole("list");
        await list.scrollIntoViewIfNeeded();
        const bounds = (await list.boundingBox())!;
        const client = await context.newCDPSession(page);
        await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bounds.x + 300, y: bounds.y + 45 }] });
        for (const x of [260, 210, 160, 100, 50]) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: bounds.x + x, y: bounds.y + 45 }] });
        await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await expect.poll(() => list.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
        await client.detach();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ caret: "initial", path: testInfo.outputPath(`home-${size.width}-${theme}.png`), fullPage: true });
    }
  }
});

test("products archive and restore through the centralized page without republishing", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const suffix = testInfo.project.name.startsWith("mobile") ? "MOB" : "DESK";
  await page.setViewportSize(suffix === "MOB" ? { width: 393, height: 727 } : { width: 1440, height: 900 });
  const sku = `ARCHIVE-E2E-${suffix}`;
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let id: string;
  try {
    const result = await pool.query<{ id: string }>(`insert into products (sku, slug, title, brand_id, component_type_id, part_number, normalized_part_number, status, is_public)
      select $1, lower($1), $2, brand_id, component_type_id, $1, $1, 'ACTIVE', true from products where status = 'ACTIVE' limit 1 returning id`, [sku, `Producto archivo ${suffix}`]);
    id = result.rows[0]!.id;
  } finally { await pool.end(); }
  await login(page);
  await page.goto(`/admin/productos/${id}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Archivar producto", exact: true }).click();
  await expect(page.getByText(/Producto archivado; restaura/u)).toBeVisible();
  await page.goto(`/admin/productos?q=${sku}`);
  await expect(page.getByRole("row").filter({ hasText: sku })).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: testInfo.project.name.startsWith("mobile") ? "Navegación móvil de gestión" : "Navegación de gestión", exact: true });
  await nav.getByRole("link", { name: "Archivados", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Archivados", exact: true })).toBeVisible();
  for (const name of ["Marcas", "Tipos de pieza", "Ubicaciones", "Cajas", "Productos"]) {
    await page.getByRole("navigation", { name: "Categorías de archivados" }).getByRole("link", { name: new RegExp(`^${name} \\(`, "u") }).click();
    await expect(page.getByLabel(new RegExp(`Buscar en ${name.toLowerCase()}`, "u"))).toBeVisible();
  }
  await page.getByLabel("Buscar en productos", { exact: true }).fill(sku.toLowerCase());
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: sku });
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) {
      await page.getByRole("button", { name: /Cambiar a modo/u }).click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.screenshot({ animations: "disabled", caret: "initial", path: testInfo.outputPath(`archives-${theme}.png`), fullPage: true });
  }
  await row.getByRole("button", { name: "Restaurar", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText("Producto restaurado correctamente.", { exact: true })).toBeVisible();
  await page.goto(`/admin/productos?q=${sku}`);
  await expect(page.getByRole("row").filter({ hasText: sku })).toContainText("Borrador");
  const checkPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    const result = await checkPool.query("select id, sku, status, is_public from products where id = $1", [id]);
    expect(result.rows[0]).toEqual({ id, sku, status: "DRAFT", is_public: false });
  } finally { await checkPool.end(); }
  await page.screenshot({ caret: "initial", path: testInfo.outputPath("archives-admin.png"), fullPage: true });
});
