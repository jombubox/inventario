import { randomUUID } from "node:crypto";
import { expect, test, type Locator } from "@playwright/test";
import { Pool } from "pg";

import { testImage } from "./helpers/test-image";

const databaseUrl = process.env.TEST_DATABASE_URL;
const localDb = databaseUrl ? new URL(databaseUrl) : null;
test.skip(!localDb || !["127.0.0.1", "localhost"].includes(localDb.hostname) || localDb.pathname !== "/jumbobox_test" || Boolean(process.env.PLAYWRIGHT_BASE_URL), "Uses only local disposable PostgreSQL and fake R2.");

const productPath = "/catalogo/mainboard-bn94-07820f-samsung-un55nu7100";
const generic = "Hola, buen día. Me comunico desde la página de JumboBox y me gustaría recibir información sobre sus productos. ¡Gracias!";

async function linkMessage(link: Locator) {
  const href = await link.getAttribute("href");
  const url = new URL(href!);
  expect(url.origin).toBe("https://wa.me");
  expect(url.pathname).toBe("/5218143911759");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  return url.searchParams.get("text")!;
}

test("public product quotations preserve identity, zero-stock semantics and visibility", async ({ page }) => {
  await page.goto(productPath);
  const mainLink = page.locator("[data-product-contact-main] a");
  await expect(mainLink).toContainText("Comprar por WhatsApp");
  const first = await linkMessage(mainLink);
  expect(first).toContain("Producto: Mainboard Samsung BN94-07820F\nSKU: SAM-MB-BN9407820F\nNúmero de parte: BN94-07820F");
  expect(first).toContain(`https://inventario-five-mu.vercel.app${productPath}`);
  expect(first).not.toMatch(/NO_PUBLICAR|CAJA-E2E|E2E-A01|localhost|127\.0\.0\.1|\/admin|locationId|acquisition/);

  await page.goto("/catalogo/fuente-lg-agotada");
  await expect(mainLink).toContainText("Consultar disponibilidad");
  const exhausted = await linkMessage(mainLink);
  expect(exhausted).toContain("Producto: Fuente LG agotada\nSKU: LG-PSU-EAYAGOTADA");
  expect(exhausted).toContain("si volverá a estar disponible o si pueden conseguirlo");
  expect(exhausted).not.toContain("BN94-07820F");

  await page.goto("/catalogo/mainboard-samsung-sin-numero-parte");
  const noPart = await linkMessage(mainLink);
  expect(noPart).toContain("SKU: SAM-MB-UN50MODELONLY");
  expect(noPart).not.toMatch(/Número de parte:|undefined|null/);

  for (const slug of ["mainboard-bn94-private", "mainboard-samsung-archivada", "no-existe-e2e"]) {
    await page.goto(`/catalogo/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("no está disponible públicamente");
    await expect(page.locator("[data-product-contact-main]")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  }
});

test("navigation, homepage and footer use generic contact; keyboard activation performs no writes", async ({ page, context }, testInfo) => {
  const writes: string[] = [];
  const whatsappRequests: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url());
    if (request.url().startsWith("https://wa.me/")) whatsappRequests.push(request.url());
  });
  await page.goto("/");
  const mobile = testInfo.project.name.startsWith("mobile");
  if (mobile) await page.getByLabel("Menú de navegación").click();
  const navigation = page.getByRole("navigation", { name: mobile ? "Navegación móvil" : "Navegación principal", exact: true });
  expect(await linkMessage(navigation.getByRole("link", { name: /^WhatsApp/ }))).toBe(generic);
  await navigation.getByRole("link", { name: "Contáctanos", exact: true }).click();
  await expect(page).toHaveURL(/\/contacto$/);
  if (mobile) await expect(page.locator("header details")).not.toHaveAttribute("open", "");
  await expect(page).toHaveTitle("Contáctanos | JumboBox");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/contacto$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contáctanos");
  const contactLink = page.getByRole("link", { name: /^Enviar mensaje por WhatsApp/ });
  expect(await linkMessage(contactLink)).toBe(generic);
  expect(await linkMessage(page.getByRole("contentinfo").getByRole("link", { name: /^WhatsApp/ }))).toBe(generic);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Contáctanos" })).toHaveAttribute("href", "/contacto");
  await page.goto("/");
  expect(await linkMessage(page.getByRole("link", { name: /^Preguntar por WhatsApp/ }))).toBe(generic);
  await page.goto(productPath);

  const pool = new Pool({ connectionString: databaseUrl });
  const snapshot = async () => {
    const result = await pool.query(`select
      (select jsonb_agg(to_jsonb(p) order by id) from products p) as products,
      (select jsonb_agg(to_jsonb(i) order by id) from inventory_items i) as inventory,
      (select jsonb_agg(to_jsonb(m) order by id) from inventory_movements m) as movements,
      (select jsonb_agg(to_jsonb(a) order by id) from audit_logs a) as audits`);
    return result.rows;
  };
  try {
    const before = await snapshot();
    expect(whatsappRequests).toEqual([]);
    // Fulfill locally: test standard anchor navigation without contacting WhatsApp.
    await context.route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Local WhatsApp navigation check</title>" }));
    const link = page.locator("[data-product-contact-main] a");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mainboard Samsung BN94-07820F");
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await link.focus();
    await expect(link).toBeFocused();
    expect(await link.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
    const newTab = context.waitForEvent("page");
    await page.keyboard.press("Enter");
    const opened = await newTab;
    await opened.waitForURL("https://wa.me/**");
    expect(new URL(opened.url()).searchParams.get("text")).toContain("SKU: SAM-MB-BN9407820F");
    await opened.close();
    expect(await snapshot()).toEqual(before);
    expect(writes).toEqual([]);
    await expect(page).toHaveURL(new RegExp(`${productPath}$`));
  } finally { await pool.end(); }
});

test("product/contact visuals fit all sizes and themes; sticky CTA yields to gallery, menu and footer", async ({ page, request }, testInfo) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const objectKey = `products/SAM-MB-BN9407820F/${randomUUID()}.png`;
  const objectUrl = `http://127.0.0.1:5555/jombubox-e2e/${objectKey}`;
  expect((await request.put(objectUrl, { headers: { authorization: "local-fixture", "content-type": "image/png" }, data: testImage(1600, 1200) })).ok()).toBe(true);
  const pool = new Pool({ connectionString: databaseUrl });
  const visualSku = testInfo.project.name.startsWith("mobile") ? "WA-MB-VISUAL-MOBILE" : "WA-MB-VISUAL-DESKTOP";
  const visualSlug = `${visualSku.toLowerCase()}-${randomUUID()}`;
  let productId: string | undefined;
  try {
    // Own the photo fixture: earlier upload tests also attach a primary image to
    // the shared catalog fixture. Do not replace or demote their image records.
    const result = await pool.query<{ id: string }>(`insert into products
      (sku, slug, title, brand_id, component_type_id, part_number, normalized_part_number, sale_price, currency, condition, status, is_public)
      select $1, $2, title, brand_id, component_type_id, part_number, normalized_part_number, sale_price, currency, 'USED', 'ACTIVE', true
      from products where slug = $3 returning id`, [visualSku, visualSlug, productPath.split("/").at(-1)]);
    productId = result.rows[0]!.id;
    await pool.query("insert into inventory_items (product_id, quantity, status, condition) values ($1, 2, 'AVAILABLE', 'USED_GOOD')", [productId]);
    await pool.query("insert into product_images (product_id, provider, storage_key, alt, is_primary) values ($1, 'R2', $2, 'Foto para cotización', true)", [productId, objectKey]);
    for (const size of [{ width: 1440, height: 900 }, { width: 900, height: 900 }, { width: 393, height: 727 }]) {
      await page.setViewportSize(size);
      for (const theme of ["light", "dark"] as const) {
        await page.goto("/contacto");
        const current = await page.locator("html").getAttribute("data-theme");
        if (current !== theme) await page.getByRole("button", { name: /Cambiar a modo/ }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.screenshot({ path: testInfo.outputPath(`contact-${size.width}-${theme}.png`), fullPage: true, animations: "disabled", caret: "initial" });
        await page.goto(`/catalogo/${visualSlug}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mainboard Samsung BN94-07820F");
        await expect(page.getByRole("button", { name: "Ampliar fotos de Mainboard Samsung BN94-07820F" })).toBeVisible();
        await expect.poll(() => page.getByRole("button", { name: "Ampliar fotos de Mainboard Samsung BN94-07820F" }).locator("img").evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        const main = page.locator("[data-product-contact-main]");
        const bar = page.getByRole("complementary", { name: "Cotización de este producto" });
        if (size.width === 393) {
          await expect(bar).toBeVisible();
          expect(await linkMessage(bar.getByRole("link"))).toContain(`SKU: ${visualSku}`);
          const bounds = (await bar.boundingBox())!;
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height + 1);
          expect(bounds.height).toBeLessThan(110);
          await page.getByLabel("Menú de navegación").click();
          await expect(bar).not.toBeVisible();
          await page.getByLabel("Menú de navegación").click();
          await expect(bar).toBeVisible();
        } else { await expect(bar).not.toBeVisible(); }
        await page.screenshot({ path: testInfo.outputPath(`product-${size.width}-${theme}.png`), animations: "disabled", caret: "initial" });
        await main.scrollIntoViewIfNeeded();
        await expect(bar).not.toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`product-action-${size.width}-${theme}.png`), animations: "disabled", caret: "initial" });
        const link = main.getByRole("link");
        const colors = await link.evaluate((element) => { const style = getComputedStyle(element); return { background: style.backgroundColor, color: style.color, height: element.getBoundingClientRect().height }; });
        expect(colors).toEqual({ background: "rgb(45, 111, 234)", color: "rgb(255, 255, 255)", height: 48 });
        const photo = page.getByRole("button", { name: "Ampliar fotos de Mainboard Samsung BN94-07820F" });
        await photo.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(bar).not.toBeVisible();
        await expect(dialog.locator("img").first()).toHaveAttribute("src", objectUrl);
        await expect.poll(() => dialog.locator("img").first().evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1600);
        if (size.width === 1440 && !testInfo.project.name.startsWith("mobile")) {
          await dialog.locator("[data-product-zoom]").hover();
          await expect(dialog.locator("[data-product-zoom]")).toHaveCSS("transform", "matrix(2.25, 0, 0, 2.25, 0, 0)");
        }
        await page.screenshot({ path: testInfo.outputPath(`viewer-${size.width}-${theme}.png`), animations: "disabled", caret: "initial" });
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
        await expect(bar).not.toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        await page.goto("/");
        await page.getByRole("heading", { name: "¿No encuentras la pieza que buscas?" }).scrollIntoViewIfNeeded();
        await expect(page.getByRole("region", { name: "Paqueterías", exact: true }).getByRole("img")).toHaveCount(3);
        await page.screenshot({ path: testInfo.outputPath(`home-contact-${size.width}-${theme}.png`), animations: "disabled", caret: "initial" });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      }
    }
  } finally {
    if (productId) {
      await pool.query("delete from product_images where product_id = $1", [productId]);
      await pool.query("delete from inventory_items where product_id = $1", [productId]);
      await pool.query("delete from products where id = $1", [productId]);
    }
    await pool.end();
    await request.delete(objectUrl);
  }
});
