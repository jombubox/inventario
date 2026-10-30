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

test("logo marquees preserve artwork and show every logo without motion in all themes and sizes", async ({ page }, testInfo) => {
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
        await expect(section.getByRole("button")).toHaveCount(0);
        const track = list.locator("..");
        await expect(track).toHaveCSS("animation-name", "none");
        expect(await list.locator("li:not([data-duplicate])").evaluateAll((items) => items.every((item) => {
          const bounds = item.getBoundingClientRect();
          const viewport = item.closest("[data-paused]")!.getBoundingClientRect();
          return bounds.width > 0 && bounds.left >= viewport.left && bounds.right <= viewport.right && bounds.bottom <= viewport.bottom;
        }))).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ caret: "initial", path: testInfo.outputPath(`home-${size.width}-${theme}.png`), fullPage: true });
    }
  }
});

test("logo marquees loop seamlessly, pause accessibly and never overflow", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const size of [{ width: 1440, height: 900 }, { width: 900, height: 900 }, { width: 393, height: 727 }]) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"]) {
      await page.addInitScript((value) => localStorage.setItem("jombubox-theme", value), theme);
      await page.goto("/");
      for (const title of ["Marcas de electrónicos", "Paqueterías"]) {
        const section = page.getByRole("region", { name: title, exact: true });
        const viewport = section.locator("[data-paused]");
        const track = section.getByRole("list").locator("..");
        await viewport.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await expect(section.getByRole("button", { name: /Anterior|Siguiente|Previous|Next/u })).toHaveCount(0);
        await expect(section.getByRole("tab")).toHaveCount(0);
        await expect(section.getByRole("button")).toHaveCount(1);
        await expect(track).toHaveCSS("animation-timing-function", "linear");
        await expect(track).toHaveCSS("animation-iteration-count", "infinite");
        const start = await track.evaluate((element) => getComputedStyle(element).transform);
        await expect.poll(() => track.evaluate((element) => getComputedStyle(element).transform)).not.toBe(start);

        // Sample both sides of the loop boundary without waiting two minutes.
        const seam = await track.evaluate((element) => {
          const animation = element.getAnimations()[0]!;
          const originalTime = animation.currentTime;
          const duration = Number(animation.effect!.getTiming().duration);
          const groups = element.querySelectorAll("ul");
          const width = groups[0]!.getBoundingClientRect().width;
          animation.currentTime = duration - 1;
          const before = groups[1]!.querySelector("li")!.getBoundingClientRect().left;
          animation.currentTime = 0;
          const after = groups[0]!.querySelector("li")!.getBoundingClientRect().left;
          animation.currentTime = originalTime;
          return { delta: Math.abs(after - before), width, cloneWidth: groups[1]!.getBoundingClientRect().width, viewportWidth: element.parentElement!.clientWidth };
        });
        expect(seam.delta).toBeLessThan(1);
        expect(seam.width).toBeCloseTo(seam.cloneWidth, 2);
        expect(seam.width).toBeGreaterThanOrEqual(seam.viewportWidth);

        const pause = section.getByRole("button", { name: /Pausar movimiento/u });
        if (testInfo.project.name.startsWith("mobile")) await pause.tap();
        else await pause.click();
        await expect(track).toHaveCSS("animation-play-state", "paused");
        const stopped = await track.evaluate((element) => getComputedStyle(element).transform);
        await page.waitForTimeout(150);
        expect(await track.evaluate((element) => getComputedStyle(element).transform)).toBe(stopped);
        const resume = section.getByRole("button", { name: /Reanudar movimiento/u });
        await resume.focus();
        await page.keyboard.press("Enter");
        await page.mouse.move(0, 0);
        await expect(track).toHaveCSS("animation-play-state", "running");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: testInfo.outputPath(`marquees-${size.width}-${theme}.png`), fullPage: true });
    }
  }
  // Also respond to an OS preference change while the page is open.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const section of await page.getByRole("region").filter({ has: page.locator("[data-paused]") }).all()) {
    await expect(section.getByRole("list").locator("..")).toHaveCSS("animation-name", "none");
    await expect(section.getByRole("button")).toHaveCount(0);
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
