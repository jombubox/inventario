import { goToQuickAddStep } from "./helpers/quick-add-wizard";
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/db/schema";
import { brands, componentTypes, products, locations, inventoryItems } from "../../src/db/schema";

const source = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
const local = source && ["localhost", "127.0.0.1"].includes(source.hostname) && source.pathname === "/jumbobox_test";
test.skip(!local || Boolean(process.env.PLAYWRIGHT_BASE_URL), "Requires disposable local database.");
let sku: string, productId: string, slug: string;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("admin@e2e.local");
  await page.getByLabel("Contraseña").fill("JombuBox-E2E-Admin-123!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.beforeAll(async ({}, info) => {
  if (!source || !local) return;
  const pool = new Pool({ connectionString: source.href });
  const db = drizzle(pool, { schema });
  const suffix = info.project.name.startsWith("mobile") ? "MOB" : "DESK";
  sku = `SAM-MB-UXCOND-${suffix}`; slug = `ux-condition-${suffix.toLowerCase()}`;
  try {
    const brand = await db.query.brands.findFirst({ where: eq(brands.code, "SAM") });
    const type = await db.query.componentTypes.findFirst({ where: eq(componentTypes.code, "MB") });
    if (!brand || !type) throw new Error("Local catalogs missing");
    const [product] = await db.insert(products).values({ sku, slug, brandId: brand.id, componentTypeId: type.id, title: `Tarjeta UX ${suffix}`, partNumber: `UXCOND-${suffix}`, normalizedPartNumber: `UXCOND${suffix}`, salePrice: "1200.00", status: "ACTIVE", isPublic: true }).returning();
    productId = product!.id;
    const [warehouse] = await db.insert(locations).values({ code: `UX-WH-${suffix}`, name: `Almacén UX ${suffix}`, type: "WAREHOUSE" }).returning();
    const [box] = await db.insert(locations).values({ code: `UX-BOX-${suffix}`, name: "Caja 18", type: "BOX", parentId: warehouse!.id }).returning();
    const [bag] = await db.insert(locations).values({ code: `UX-BAG-${suffix}`, name: "7", type: "BAG", parentId: box!.id }).returning();
    await db.insert(inventoryItems).values([{ productId, locationId: bag!.id, quantity: 3 }, { productId, locationId: box!.id, quantity: 2 }]);
  } finally { await pool.end(); }
});

test("Inventory shows SKU, physical box/bag and one Edit entry point with all existing operations", async ({ page }, info) => {
  await login(page); await page.goto(`/admin/inventario?q=${sku}`);
  const row = page.locator("article").filter({ hasText: "Bolsa 7" });
  await expect(row).toHaveCount(1);
  await expect(row.locator("[data-inventory-sku]")).toHaveText(sku);
  await expect(row.getByText(sku, { exact: true })).toHaveCount(1);
  await expect(row.getByText("Caja 18", { exact: true })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Sin bolsa" })).toHaveCount(1);
  await expect(page.getByText("Mover, ajustar o editar este registro")).toHaveCount(0);
  await expect(row.locator("form")).toHaveCount(0);
  const trigger = row.getByRole("button", { name: `Editar inventario ${sku}` });
  await noOverflow(page); await page.screenshot({ path: info.outputPath("inventory.png"), fullPage: true });
  await trigger.click();
  const modal = page.getByRole("dialog", { name: "Editar inventario" });
  for (const title of ["Datos físicos", "Mover ubicación", "Ajustar cantidad", "Entrada o devolución", "Salida o venta"]) await expect(modal.getByRole("heading", { name: title })).toBeVisible();
  await noOverflow(page); await page.screenshot({ path: info.outputPath("inventory-editor.png"), fullPage: true });
  await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0); await expect(trigger).toBeFocused();
});

test("Quick Add defaults Nuevo, persists Usado and edit/public pages retain the condition", async ({ page }, info) => {
  test.setTimeout(120_000);
  const suffix = info.project.name.startsWith("mobile") ? "MOB" : "DESK";
  await login(page);
  for (const condition of ["NEW", "USED"] as const) {
    await page.locator("[data-quick-add-trigger]").filter({ visible: true }).first().click();
    const modal = page.getByRole("dialog", { name: "Agregar producto al inventario" });
    await modal.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
    await goToQuickAddStep(modal, 2);
    await modal.getByLabel("Número de parte", { exact: true }).fill(`UX-${condition}-${suffix}`);
    await goToQuickAddStep(modal, 5);
    await expect(modal.getByLabel("Condición", { exact: true })).toHaveValue("NEW");
    await goToQuickAddStep(modal, 5);
    await modal.getByLabel("Condición", { exact: true }).selectOption(condition);
    await goToQuickAddStep(modal, 2);
    await modal.getByLabel("Número de parte", { exact: true }).fill(`UX-${condition}-${suffix}`);
    await goToQuickAddStep(modal, 5);
    await modal.getByLabel("Condición", { exact: true }).scrollIntoViewIfNeeded();
    await goToQuickAddStep(modal, 5);
    await expect(modal.getByLabel("Condición", { exact: true })).toBeInViewport();
    expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await noOverflow(page); await page.screenshot({ path: info.outputPath(`create-${condition}.png`), fullPage: true });
    await goToQuickAddStep(modal, 5);
    await modal.getByLabel("Ubicación", { exact: true }).selectOption({ label: "Almacén E2E" });
    await goToQuickAddStep(modal, 5);
    await modal.getByRole("button", { name: "Agregar producto", exact: true }).click();
    await expect(modal.getByText(/unidad\(es\) agregadas correctamente/)).toBeVisible({ timeout: 30_000 });
    const publicPath = await modal.getByRole("link", { name: "Ver publicación" }).getAttribute("href");
    await modal.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.goto(publicPath!);
    const conditionBlock = page.locator("dl > div").filter({ has: page.locator("dt", { hasText: /^Condición$/ }) });
    await expect(conditionBlock.locator("dd")).toHaveText(condition === "NEW" ? "Nuevo" : "Usado");
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`public-${condition}.png`), fullPage: true });
    await page.goto(`/admin/productos?q=UX-${condition}-${suffix}`);
    await page.getByRole("link", { name: "Editar", exact: true }).click();
    await expect(page.getByLabel("Condición", { exact: true })).toHaveValue(condition);
    if (condition === "USED") {
      await page.getByLabel("Condición", { exact: true }).selectOption("NEW");
      await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
      await expect(page.getByText("Producto actualizado correctamente.")).toBeVisible({ timeout: 30_000 });
      await page.reload(); await expect(page.getByLabel("Condición", { exact: true })).toHaveValue("NEW");
      await page.goto(publicPath!); await expect(conditionBlock.locator("dd")).toHaveText("Nuevo");
    }
    await page.goto("/admin");
  }
});

test("older products keep a safe unclassified condition during ordinary edits", async ({ page }, info) => {
  await page.goto(`/catalogo/${slug}`);
  await expect(page.locator("dl").getByText("Sin especificar", { exact: true })).toBeVisible(); await noOverflow(page);
  await login(page); await page.goto(`/admin/productos/${productId}`);
  await expect(page.getByLabel("Condición", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByText("Producto actualizado correctamente.")).toBeVisible({ timeout: 30_000 });
  await page.reload(); await expect(page.getByLabel("Condición", { exact: true })).toHaveValue("");
  await page.screenshot({ path: info.outputPath("legacy-edit.png"), fullPage: true });
});

test("electronics hero remains decorative and readable in both themes without overflow", async ({ page }, info) => {
  await page.goto("/");
  const art = page.locator("[data-hero-boards]");
  await expect(art).toHaveAttribute("aria-hidden", "true");
  await expect(art.locator("img")).toHaveAttribute("alt", "");
  await expect(art.locator("img")).toHaveJSProperty("complete", true);
  expect(await art.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(await art.evaluate(el => getComputedStyle(el).pointerEvents)).toBe("none");
  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: /Cambiar a modo/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(await art.locator("img").evaluate(el => Number(getComputedStyle(el).opacity))).toBe(theme === "light" ? 0.16 : 0.28);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Buscar piezas" })).toBeVisible();
    await noOverflow(page); await page.locator("section").filter({ has: art }).screenshot({ path: info.outputPath(`hero-${theme}.png`) });
  }
  await page.getByLabel("Buscar en el catálogo").fill("UX");
  await page.getByRole("button", { name: "Buscar piezas" }).click();
  await expect(page).toHaveURL(/\/catalogo\?q=UX/);
});
