import { expect, test } from "@playwright/test";

test("home → BN94 search → brand filter → public product detail", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Refacciones electrónicas");
  await page.getByLabel("Buscar en el catálogo").fill("BN94");
  await page.getByRole("button", { name: "Buscar piezas" }).click();
  await expect(page).toHaveURL(/\/catalogo\?q=BN94/);
  await expect(page.getByText("Mainboard Samsung BN94-07820F", { exact: true })).toBeVisible();

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: /^Filtros/ }).click();
    const dialog = page.getByRole("dialog", { name: "Filtrar catálogo" });
    await dialog.getByLabel("Marca").selectOption("samsung");
    await dialog.getByRole("button", { name: "Aplicar" }).click();
  } else {
    await page.locator("aside").getByLabel("Marca").selectOption("samsung");
    await page.locator("aside").getByRole("button", { name: "Aplicar" }).click();
  }

  await expect(page).toHaveURL(/marca=samsung/);
  await page.getByRole("link", { name: /Mainboard Samsung BN94-07820F/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mainboard Samsung BN94-07820F");
  await expect(page.getByText("SAM-MB-BN9407820F", { exact: true })).toBeVisible();
  await expect(page.getByText("Pocas piezas", { exact: true })).toBeVisible();
  await expect(page.getByText("CAJA-E2E", { exact: true })).toHaveCount(0);
});

test("a private product URL is indistinguishable from a missing product", async ({ page }) => {
  await page.goto("/catalogo/mainboard-bn94-private");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("no está disponible públicamente");
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();

  await page.goto("/catalogo/no-existe-e2e");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("no está disponible públicamente");
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});
