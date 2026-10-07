import { goToQuickAddStep } from "./helpers/quick-add-wizard";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { testImage } from "./helpers/test-image";

const database = process.env.TEST_DATABASE_URL ? new URL(process.env.TEST_DATABASE_URL) : null;
test.skip(!database || !["localhost", "127.0.0.1"].includes(database.hostname) || database.pathname !== "/jumbobox_test", "Requires disposable local jumbobox_test.");
test.use({ actionTimeout: 15_000 });
test.beforeEach(async () => {
  // Each case gets an independent quota in this disposable database; application limits stay enabled.
  if (!database || !["localhost", "127.0.0.1"].includes(database.hostname) || database.pathname !== "/jumbobox_test") return;
  const pool = new Pool({ connectionString: database.href });
  try { await pool.query("delete from operational_rate_limits where key in ('image-upload:admin', 'image-confirm:admin', 'image-mutation:admin')"); }
  finally { await pool.end(); }
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("admin@e2e.local");
  await page.getByLabel("Contraseña").fill("JombuBox-E2E-Admin-123!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function newProduct(page: Page) {
  await page.locator("[data-quick-add-trigger]").filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Agregar producto al inventario" });
  await dialog.getByRole("button", { name: "Agregar producto nuevo", exact: true }).click();
  return dialog;
}

for (const section of ["productos", "inventario"]) {
  test(`${section}: default empty filters submit safely and typing searches without submit`, async ({ page }) => {
    await login(page);
    await page.goto(`/admin/${section}`);
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Aplicar filtros", exact: true }) });
    await form.locator('input[name="q"]').fill("EAY123456");
    await form.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await expect(page.getByRole("heading", { name: section === "productos" ? "Productos" : "Inventario", exact: true })).toBeVisible();
    await form.locator('input[name="q"]').fill("BN94");
    await expect(page).toHaveURL(/q=BN94/, { timeout: 10_000 });
    await expect(form.locator('input[name="q"]')).toBeFocused();
    await form.locator('input[name="q"]').fill("not-a-real-result");
    await expect(page.getByText(`No encontramos ${section === "productos" ? "productos" : "inventario"} con esa búsqueda.`)).toBeVisible();
    await form.locator('input[name="q"]').fill("   ");
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByText(`No encontramos ${section === "productos" ? "productos" : "inventario"} con esa búsqueda.`)).toHaveCount(0);
    await form.locator('select[name="status"]').selectOption(section === "productos" ? "ACTIVE" : "AVAILABLE");
    await form.locator('input[name="q"]').fill("samsung");
    await expect(page).toHaveURL(/status=(ACTIVE|AVAILABLE)/);
    await expect(page).toHaveURL(/q=samsung/);
    await page.goto(`/admin/${section}?page=2&status=${section === "productos" ? "ACTIVE" : "AVAILABLE"}`);
    await form.locator('input[name="q"]').fill("BN94");
    await expect(page).toHaveURL(/q=BN94/);
    await expect(page).not.toHaveURL(/page=2/);
    await form.locator('input[name="q"]').fill("EAY");
    await form.locator('input[name="q"]').fill("BN94");
    await expect(page).toHaveURL(/q=BN94/);
  });
}

test("photo selection survives returning to the form without duplicates or revoked previews", async ({ page }, testInfo) => {
  await login(page);
  const dialog = await newProduct(page);
  await goToQuickAddStep(dialog, 2);
  await dialog.getByLabel("Número de parte", { exact: true }).fill(`PHOTO-REG-${testInfo.project.name}`);
  const file = { name: "same-photo.png", mimeType: "image/png", buffer: testImage() };
  await goToQuickAddStep(dialog, 4);
  await dialog.getByLabel(/Agregar fotos/).setInputFiles(file);
  await goToQuickAddStep(dialog, 4);
  await dialog.getByLabel(/Agregar fotos/).setInputFiles(file);
  await goToQuickAddStep(dialog, 4);
  await expect(dialog.getByRole("button", { name: "Eliminar foto: same-photo.png", exact: true })).toHaveCount(1);
  await goToQuickAddStep(dialog, 5);
  await goToQuickAddStep(dialog, 2);
  await goToQuickAddStep(dialog, 4);
  const livePreviews = await dialog.locator('[style*="blob:"]').evaluateAll(async elements => {
    return Promise.all(elements.map(async element => {
      const url = (element as HTMLElement).style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
      return url ? new Promise<boolean>((resolve) => { const image = new Image(); image.onload = () => resolve(image.naturalWidth > 0); image.onerror = () => resolve(false); image.src = url; }) : false;
    }));
  });
  expect(livePreviews).toEqual([true]);
});

test("retry after a lost successful upload response does not duplicate a stored image", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await login(page);
  const dialog = await newProduct(page);
  await goToQuickAddStep(dialog, 2);
  await dialog.getByLabel("Número de parte", { exact: true }).fill(`LOST-UPLOAD-${testInfo.project.name}`);
  await goToQuickAddStep(dialog, 4);
  await dialog.getByLabel(/Agregar fotos/).setInputFiles({ name: "retained.png", mimeType: "image/png", buffer: testImage() });
  let first = true;
  await page.route("**/api/products/images/confirm", async route => {
    if (first) { first = false; await route.fetch(); await route.abort("failed"); }
    else await route.continue();
  });
  await goToQuickAddStep(dialog, 5);
  await dialog.getByRole("button", { name: "Agregar producto", exact: true }).click();
  await expect(dialog.getByText("El producto y el inventario sí se guardaron.")).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: /Reintentar.*(?:foto|subida)/ }).first().click();
  await expect(dialog.getByText("Las fotos se guardaron correctamente.")).toBeVisible({ timeout: 30_000 });
  const url = await dialog.getByRole("link", { name: "Ver publicación" }).getAttribute("href");
  await page.goto(url!);
  await expect(page.getByRole("button", { name: /^Ver imagen \d+ de \d+$/ })).toHaveCount(0);
});

test("a selected photo preview remains live after navigating back to creation", async ({ page }, testInfo) => {
  await login(page);
  const dialog = await newProduct(page);
  await goToQuickAddStep(dialog, 2);
  await dialog.getByLabel("Número de parte", { exact: true }).fill(`PREVIEW-REG-${testInfo.project.name}`);
  await goToQuickAddStep(dialog, 4);
  await dialog.getByLabel(/Agregar fotos/).setInputFiles({ name: "preview.png", mimeType: "image/png", buffer: testImage() });
  await goToQuickAddStep(dialog, 2);
  await dialog.getByLabel("Número de parte", { exact: true }).press("Enter");
  await expect(dialog.getByRole("heading", { name: "Identificación del producto" })).toBeVisible();
  await goToQuickAddStep(dialog, 5);
  await goToQuickAddStep(dialog, 2);
  await goToQuickAddStep(dialog, 4);
  const live = await dialog.locator('[style*="blob:"]').first().evaluate(async element => {
    const url = (element as HTMLElement).style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    return url ? new Promise<boolean>((resolve) => { const image = new Image(); image.onload = () => resolve(image.naturalWidth > 0); image.onerror = () => resolve(false); image.src = url; }) : false;
  });
  expect(live).toBe(true);
});

test("three selected images retain order and primary across Quick Add, edit and public views", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize(testInfo.project.name.startsWith("mobile") ? { width: 393, height: 727 } : { width: 1440, height: 900 });
  await login(page);
  const dialog = await newProduct(page);
  const title = `Image order ${testInfo.project.name}`;
  await goToQuickAddStep(dialog, 2);
  await dialog.getByLabel("Número de parte", { exact: true }).fill(`ORDER-${testInfo.project.name}`);
  await goToQuickAddStep(dialog, 2);
  await dialog.getByLabel("Nombre del producto").fill(title);
  const formats = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 100; canvas.height = 80;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#f08020"; ctx.fillRect(0, 0, 100, 80);
    return ["image/jpeg", "image/webp"].map((mimeType) => ({ mimeType, data: canvas.toDataURL(mimeType).split(",")[1]! }));
  });
  const limit = Buffer.alloc(10 * 1024 * 1024); testImage().copy(limit);
  await goToQuickAddStep(dialog, 4);
  const photoInput = dialog.getByLabel(/Agregar fotos/);
  await photoInput.setInputFiles({ name: "limit.png", mimeType: "image/png", buffer: limit });
  await goToQuickAddStep(dialog, 4);
  await expect(dialog.getByRole("button", { name: "Eliminar foto: limit.png" })).toBeVisible();
  await goToQuickAddStep(dialog, 4);
  await dialog.getByRole("button", { name: "Eliminar foto: limit.png" }).click();
  await photoInput.setInputFiles({ name: "spoof.png", mimeType: "image/png", buffer: Buffer.from("invalid binary") });
  await expect(dialog.getByRole("alert")).toContainText("firma binaria");
  await photoInput.setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: testImage() },
    { name: "two.jpg", mimeType: "image/jpeg", buffer: Buffer.from(formats[0]!.data, "base64") },
    { name: "three.webp", mimeType: "image/webp", buffer: Buffer.from(formats[1]!.data, "base64") },
  ]);
  await expect(dialog.locator('[data-photo-state="selected"]')).toHaveCount(3);
  await goToQuickAddStep(dialog, 4);
  await dialog.getByRole("button", { name: "Hacer foto principal: three.webp", exact: true }).click();
  await goToQuickAddStep(dialog, 4);
  await dialog.getByRole("button", { name: "Mover foto a la derecha: one.png", exact: true }).click();
  await expect(dialog.locator('[data-photo-state]').first()).toContainText("three.webp");
  await goToQuickAddStep(dialog, 5);
  await dialog.getByRole("button", { name: "Agregar producto", exact: true }).click();
  await expect(dialog.getByText("Las fotos se guardaron correctamente.")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator('[data-photo-state="uploaded"]')).toHaveCount(3);
  const publicPath = (await dialog.getByRole("link", { name: "Ver publicación" }).getAttribute("href"))!;
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.goto(`/admin/productos?q=${encodeURIComponent(title)}`);
  const row = page.locator("tbody tr").filter({ hasText: title });
  const editPath = (await row.getByRole("link", { name: "Editar", exact: true }).getAttribute("href"))!;
  const productId = editPath.split("/").pop()!;
  const review = async () => {
    const response = await page.request.get(`/api/admin/products/${productId}/review`);
    expect(response.ok()).toBe(true);
    return response.json() as Promise<{ images: { url: string; alt: string }[] }>;
  };
  expect((await review()).images.map(({ alt }) => alt)).toEqual(["three", "two", "one"]);
  await expect(row.locator("img")).toHaveAttribute("src", /\.webp/);
  await page.goto(editPath);
  const cards = page.locator("article").filter({ has: page.getByLabel("Texto alternativo") });
  await expect(cards.first().getByLabel("Texto alternativo")).toHaveValue("three");
  await cards.nth(2).getByRole("button", { name: "Hacer foto principal", exact: true }).click();
  await expect(cards.first().getByLabel("Texto alternativo")).toHaveValue("one");
  await page.reload();
  await expect(cards.first().getByLabel("Texto alternativo")).toHaveValue("one");
  await page.route("**/api/products/images/reorder", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "No fue posible guardar el orden." }) }));
  await cards.first().getByRole("button", { name: "Mover foto a la derecha", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "guardar el orden" })).toBeVisible();
  expect((await review()).images.map(({ alt }) => alt)).toEqual(["one", "three", "two"]);
  await page.unroute("**/api/products/images/reorder");
  await cards.first().getByRole("button", { name: "Mover foto a la derecha", exact: true }).click();
  await expect(cards.first().getByLabel("Texto alternativo")).toHaveValue("three");
  const saved = (await review()).images;
  await page.goto(`/admin/productos?q=${encodeURIComponent(title)}`);
  await expect(row.locator("img")).toHaveAttribute("src", /\.webp/);
  await row.getByRole("button", { name: `Ver fotos de ${title}` }).click();
  const viewer = page.getByRole("dialog", { name: "Fotos del producto" });
  await checkViewer(page, viewer, testInfo.project.name.startsWith("mobile"));
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(row.getByRole("button", { name: `Ver fotos de ${title}` })).toBeFocused();
  await page.goto(`/catalogo?q=${encodeURIComponent(title)}`);
  await expect(page.locator('img[src*=".webp"]').first()).toBeVisible();
  await page.goto(publicPath);
  const thumbnails = page.getByRole("button", { name: /^Ver imagen \d+ de 3$/ });
  for (let index = 0; index < 3; index++) await expect(thumbnails.nth(index).locator("img")).toHaveAttribute("src", new RegExp(encodeURIComponent(saved[index]!.url).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page.getByRole("button", { name: /^Ver imagen 2 de 3$/ }).click();
  await page.getByRole("button", { name: `Ampliar fotos de ${title}` }).click();
  await expect(page.getByRole("dialog").locator('[data-product-zoom] img')).toHaveAttribute("src", /\.png/);
  await checkViewer(page, page.getByRole("dialog"), testInfo.project.name.startsWith("mobile"));
});

async function checkViewer(page: Page, viewer: import("@playwright/test").Locator, mobile: boolean) {
  const zoom = viewer.locator('[data-product-zoom]');
  const bounds = (await zoom.boundingBox())!;
  expect(bounds.height).toBeGreaterThan(200);
  if (mobile) {
    await zoom.tap(); await expect(viewer).toBeVisible();
    expect(await zoom.evaluate((element) => (element as HTMLElement).style.transform)).not.toBe("scale(2.25)");
  } else {
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.3);
    await expect(zoom).toHaveCSS("transform", "matrix(2.25, 0, 0, 2.25, 0, 0)");
    const origin = await zoom.evaluate((element) => (element as HTMLElement).style.transformOrigin);
    const [x, y] = origin.split(" ").map(Number.parseFloat);
    expect(x).toBeCloseTo(70, 0); expect(y).toBeCloseTo(30, 0);
    await page.mouse.move(0, 0); await expect(zoom).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  }
  await viewer.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(viewer.getByRole("status")).toContainText("de 3");
  await page.keyboard.press("ArrowLeft");
}

test("theme tokens, persistence, admin surfaces and mobile layout match the palette", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /hydration|hydrated|server rendered.*match/i.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login"); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await login(page);
  const sizes = testInfo.project.name.startsWith("mobile") ? [{ width: 393, height: 727 }] : [{ width: 1440, height: 900 }, { width: 900, height: 900 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"] as const) {
      await page.goto("/admin");
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: theme === "dark" ? "Cambiar a modo oscuro" : "Cambiar a modo claro" }).click();
      for (const path of ["", "/productos", "/inventario", "/marcas", "/tipos-de-pieza", "/ubicaciones"]) {
        await page.goto(`/admin${path}`);
        const headings: Record<string, string> = { "": "Panel de control", "/productos": "Productos", "/inventario": "Inventario", "/marcas": "Marcas", "/tipos-de-pieza": "Tipos de pieza", "/ubicaciones": "Ubicaciones" };
        const heading = headings[path]!;
        await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        await page.locator("img").evaluateAll(async (images) => {
          await Promise.all(images.filter((image) => {
            const bounds = image.getBoundingClientRect(); return bounds.width > 0 && bounds.bottom > 0 && bounds.top < innerHeight;
          }).map((image) => (image as HTMLImageElement).decode().catch(() => undefined)));
        });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const colors = await page.evaluate(() => {
          const styles = getComputedStyle(document.documentElement);
          const hex = (name: string) => {
            const value = styles.getPropertyValue(name).trim().toUpperCase();
            return value.length === 4 ? `#${value.slice(1).split("").map((digit) => digit + digit).join("")}` : value;
          };
          return { background: hex("--background"), card: hex("--card"), primary: hex("--primary"), actual: getComputedStyle(document.body).backgroundColor };
        });
        expect(colors).toEqual({ background: theme === "light" ? "#F1F3F4" : "#0D0F11", card: theme === "light" ? "#FFFFFF" : "#191D23", primary: "#2F73F2", actual: theme === "light" ? "rgb(241, 243, 244)" : "rgb(13, 15, 17)" });
        await expect(page.locator(".bg-card").first()).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(25, 29, 35)");
        const primary = page.locator('[data-quick-add-trigger]').filter({ visible: true }).first();
        await expect(primary).toHaveCSS("background-color", "rgb(47, 115, 242)");
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        const output = testInfo.outputPath(`${size.width}-${theme}-${path.replaceAll("/", "") || "dashboard"}.png`);
        await page.screenshot({ path: output, caret: "initial" }); await testInfo.attach(`${size.width}-${theme}-${path || "dashboard"}`, { path: output, contentType: "image/png" });
      }
      await page.goto(`/admin/productos?q=${encodeURIComponent(`Image order ${testInfo.project.name}`)}`);
      await page.getByRole("button", { name: `Ver fotos de Image order ${testInfo.project.name}` }).click();
      const viewer = page.getByRole("dialog");
      await expect(viewer.locator('[data-product-zoom] img')).toBeVisible();
      await viewer.locator("img").evaluateAll(async (images) => { await Promise.all(images.map((image) => (image as HTMLImageElement).decode())); });
      const viewerOutput = testInfo.outputPath(`${size.width}-${theme}-viewer.png`);
      await page.screenshot({ path: viewerOutput, caret: "initial" }); await testInfo.attach("Image viewer", { path: viewerOutput, contentType: "image/png" });
      await checkViewer(page, viewer, testInfo.project.name.startsWith("mobile"));
      await viewer.getByRole("button", { name: "Cerrar ventana" }).click();
      const dialog = await newProduct(page);
      await goToQuickAddStep(dialog, 2);
      await dialog.getByLabel("Número de parte", { exact: true }).fill("VISUAL-ONLY");
      await goToQuickAddStep(dialog, 2);
      await expect(dialog.getByLabel("Número de parte", { exact: true })).toHaveCSS("background-color", theme === "light" ? "rgb(248, 250, 251)" : "rgb(17, 21, 26)");
      await goToQuickAddStep(dialog, 4);
      await dialog.getByLabel(/Agregar fotos/).setInputFiles([{ name: "first.png", mimeType: "image/png", buffer: testImage() }, { name: "second.png", mimeType: "image/png", buffer: testImage() }]);
      await expect(dialog.locator('[data-photo-state="selected"]')).toHaveCount(2);
      await goToQuickAddStep(dialog, 4);
      await dialog.getByRole("button", { name: "Hacer foto principal: second.png" }).click();
      await dialog.locator('[data-photo-state]').first().scrollIntoViewIfNeeded();
      const output = testInfo.outputPath(`${size.width}-${theme}-quick-add-photos.png`);
      await page.screenshot({ path: output, caret: "initial" }); await testInfo.attach("Quick Add photos", { path: output, contentType: "image/png" });
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await dialog.getByRole("button", { name: "Cerrar flujo" }).click();
      await page.reload(); await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.emulateMedia({ colorScheme: theme === "dark" ? "light" : "dark" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    }
  }
  expect(errors).toEqual([]);
});
