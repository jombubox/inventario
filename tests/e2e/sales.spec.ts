import { expect, test } from "@playwright/test";
import { Pool } from "pg";

const source = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
const safe = source && ["127.0.0.1", "localhost"].includes(source.hostname) && source.pathname === "/jumbobox_test";
test.beforeEach(() => { if (!safe) throw new Error("Sales browser tests require disposable local PostgreSQL"); });
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login"); await page.getByLabel("Correo electrónico").fill(process.env.ADMIN_EMAIL ?? "admin@e2e.local"); await page.getByLabel("Contraseña", { exact: true }).fill(process.env.ADMIN_PASSWORD ?? "JombuBox-E2E-Admin-123!"); await page.getByRole("button", { name: "Iniciar sesión" }).click(); await expect(page).toHaveURL(/\/admin$/u);
}
test("public navigation hides all admin links while direct admin routes remain protected", async ({ page }) => {
  for (const path of ["/", "/catalogo", "/contacto"]) { await page.goto(path); await expect(page.locator('a[href^="/admin"]')).toHaveCount(0); }
  await page.goto("/admin/ventas"); await expect(page).toHaveURL(/\/login/u);
  expect((await page.request.get("/api/admin/sales")).status()).toBe(401); expect((await page.request.get("/api/admin/sales/export")).status()).toBe(401);
  await login(page); await page.goto("/admin/ventas"); await expect(page.getByRole("heading", { name: "Ventas", exact: true })).toBeVisible(); await page.goto("/"); await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
});
test("admin registers a shipped sale, records payments, returns, refunds, prints and searches history", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const pool = new Pool({ connectionString: source!.href }); const marker = `SALES-E2E-${testInfo.project.name.toUpperCase()}-${Date.now()}`;
  try {
    const p = (await pool.query("insert into products(sku,slug,brand_id,component_type_id,title,sale_price,status,warranty) select $1,$2,b.id,c.id,$3,100.01,'ACTIVE','30 días' from brands b,component_types c where b.code='SAM' and c.code='MB' returning id", [marker, marker.toLowerCase(), `Producto ${marker}`])).rows[0];
    await pool.query("insert into inventory_items(product_id,quantity,legacy_bag_number,condition) values ($1,5,'E2E-VENTAS','USED_GOOD')", [p.id]);
    await login(page); await page.goto("/admin/ventas"); await page.getByRole("link", { name: "Nueva venta", exact: true }).click();
    await page.getByLabel("Buscar producto o stock").fill(marker); await page.getByRole("button", { name: "Agregar origen", exact: true }).click();
    await page.getByLabel(/^Cantidad ·/u).fill("2"); await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByLabel("Nombre completo", { exact: true }).fill(`Cliente ${marker}`); await page.getByLabel("Número de celular", { exact: true }).fill("5512345678");
    await page.getByRole("button", { name: "Anterior", exact: true }).click(); await expect(page.getByLabel(/^Cantidad ·/u)).toHaveValue("2"); await page.getByRole("button", { name: "Continuar", exact: true }).click(); await expect(page.getByLabel("Nombre completo", { exact: true })).toHaveValue(`Cliente ${marker}`);
    await page.getByRole("button", { name: "Continuar", exact: true }).click(); await page.getByLabel("Método de entrega").selectOption("SHIPPING"); await page.getByRole("button", { name: "Usar nombre y celular del cliente" }).click();
    for (const [label, value] of [["Calle", "Calle sintética"], ["Número exterior", "42"], ["Colonia", "Pruebas"], ["Código postal", "01000"], ["Ciudad / municipio", "Ciudad de México"], ["Estado", "Ciudad de México"]]) await page.getByLabel(label!, { exact: true }).fill(value!);
    await page.getByRole("button", { name: "Continuar", exact: true }).click(); await page.getByLabel("Importe recibido (MXN)").fill("50"); await page.getByLabel("Método de pago", { exact: true }).selectOption("TRANSFER"); await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Revisar y completar" }).click(); await page.getByRole("button", { name: "Confirmar venta", exact: true }).click(); await expect(page).toHaveURL(/\/admin\/ventas\/[a-f0-9-]+$/u); const saleUrl = page.url();
    await expect(page.getByText("Pago: Pago parcial", { exact: true })).toBeVisible(); expect((await pool.query("select quantity from inventory_items where product_id=$1", [p.id])).rows[0].quantity).toBe(3);
    await page.getByRole("button", { name: "Registrar pago", exact: true }).click(); await page.getByRole("button", { name: "Confirmar: registrar pago recibido" }).click(); await expect(page.getByText("Pago: Pagada", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Actualizar entrega", exact: true }).click(); await page.getByLabel("Estado de entrega", { exact: true }).selectOption("SHIPPED"); await page.getByLabel("Paquetería", { exact: true }).fill("Transportista de prueba"); await page.getByLabel("Número de guía", { exact: true }).fill(`GUIA-${marker}`); await page.getByRole("button", { name: "Confirmar: actualizar entrega" }).click(); await expect(page.getByText("Entrega: Enviado", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Registrar devolución", exact: true }).click(); await page.getByLabel(/^Cantidad a devolver ·/u).fill("1"); await page.getByLabel(/^Destino ·/u).selectOption("DAMAGED"); await page.getByLabel("Motivo de devolución", { exact: true }).fill("Daño al recibir"); await page.getByLabel("Condición del producto devuelto").fill("Conector dañado"); await page.getByLabel("Abono por devolución (MXN)").fill("100.01"); await page.getByRole("button", { name: "Confirmar: registrar devolución" }).click(); await expect(page.getByText("Pago: Reembolso pendiente", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Registrar reembolso", exact: true }).click(); await page.getByRole("button", { name: "Confirmar: registrar reembolso realizado" }).click(); await expect(page.getByText("Pago: Pagada", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Ver recibo" }).click(); await expect(page.getByRole("heading", { name: "Recibo comercial de venta" })).toBeVisible(); await expect(page.getByText("Este recibo no es una factura fiscal ni un CFDI.")).toBeVisible();
    await page.emulateMedia({ media: "print" }); await expect(page.locator("#sales-receipt")).toBeVisible(); await page.screenshot({ path: testInfo.outputPath("receipt-print.png"), fullPage: true }); if (!testInfo.project.name.startsWith("mobile")) await page.pdf({ path: testInfo.outputPath("receipt.pdf"), format: "A4" }); await page.emulateMedia({ media: "screen" });
    await page.goto("/admin/ventas"); await page.getByLabel("Buscar ventas", { exact: true }).fill(marker); await page.getByRole("combobox", { name: "Estado de venta", exact: true }).selectOption("COMPLETED"); await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click(); await expect(page.getByRole("link", { name: "Ver venta", exact: true })).toHaveCount(1);
    const download = await page.request.get(`/api/admin/sales/export?q=${marker}`); expect(download.status()).toBe(200); expect(await download.text()).toContain(marker); expect((await page.request.get(`/api/admin/sales/export?report=true&q=${marker}`)).status()).toBe(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true); await page.screenshot({ path: testInfo.outputPath("sales-history.png"), fullPage: true });
    await page.goto(saleUrl); await page.getByRole("button", { name: "Cancelar venta", exact: true }).click(); await page.getByLabel("Motivo de cancelación").fill("Resto cancelado en prueba"); await page.getByRole("button", { name: "Confirmar: cancelar venta" }).click(); await expect(page.getByText("Venta: Cancelada", { exact: true })).toBeVisible();
    const rows = (await pool.query("select status,quantity from inventory_items where product_id=$1 order by status", [p.id])).rows; expect(rows).toEqual([{ status: "AVAILABLE", quantity: 4 }, { status: "DAMAGED", quantity: 1 }]);
  } finally { await pool.end(); }
});
