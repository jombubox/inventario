import { expect, test, type Page } from "@playwright/test";

const credentials = {
  email: "admin@e2e.local",
  password: "JombuBox-E2E-Admin-123!",
} as const;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(credentials.email);
  await page.getByLabel("Contraseña").fill(credentials.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
}

test("catalog management is clear, safe and reachable on desktop and mobile", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name.startsWith("mobile") ? "MOB" : "DESK";
  const navigationName = testInfo.project.name.startsWith("mobile")
    ? "Navegación móvil de gestión"
    : "Navegación de gestión";
  const brandName = `Marca gestión ${suffix}`;
  const renamedBrand = `${brandName} editada`;
  const typeName = `Tipo gestión ${suffix}`;
  const renamedType = `${typeName} editado`;

  await login(page);
  const navigation = page.getByRole("navigation", { name: navigationName });
  await expect(page.getByRole("heading", { name: "Panel de control" })).toBeVisible();
  await expect(page.getByText("Dashboard", { exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Tablero principal", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Marcas", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Tipos de pieza", exact: true })).toBeVisible();

  await navigation.getByRole("link", { name: "Marcas", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/marcas/u);
  await page.getByLabel("Nombre de la nueva marca").fill(brandName);
  await page.getByRole("button", { name: "Crear marca" }).click();
  await expect(page.getByText("Se creó la marca.", { exact: true })).toBeVisible();
  let brandCard = page.locator("article").filter({ has: page.getByRole("heading", { name: brandName, exact: true }) });
  await expect(brandCard).toBeVisible();
  await brandCard.getByText("Editar marca", { exact: true }).click();
  await brandCard.getByLabel("Nombre").fill(renamedBrand);
  await brandCard.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Marca actualizada.", { exact: true })).toBeVisible();
  brandCard = page.locator("article").filter({ has: page.getByRole("heading", { name: renamedBrand, exact: true }) });
  page.once("dialog", (dialog) => dialog.accept());
  await brandCard.getByRole("button", { name: "Desactivar marca" }).click();
  await expect(brandCard.getByText("Inactiva", { exact: true })).toBeVisible();

  const usedBrand = page.locator("article").filter({ has: page.getByRole("heading", { name: "Samsung", exact: true }) });
  page.once("dialog", (dialog) => dialog.accept());
  await usedBrand.getByRole("button", { name: "Desactivar marca" }).click();
  await expect(usedBrand.getByText(/No puedes desactivar esta marca porque está siendo utilizada/u)).toBeVisible();

  await navigation.getByRole("link", { name: "Tipos de pieza", exact: true }).click();
  await page.getByLabel("Nombre del nuevo tipo de pieza").fill(typeName);
  await page.getByRole("button", { name: "Crear tipo de pieza" }).click();
  await expect(page.getByText("Se creó el tipo de pieza.", { exact: true })).toBeVisible();
  let typeCard = page.locator("article").filter({ has: page.getByRole("heading", { name: typeName, exact: true }) });
  await typeCard.getByText("Editar tipo de pieza", { exact: true }).click();
  await typeCard.getByLabel("Nombre").fill(renamedType);
  await typeCard.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Tipo de pieza actualizado.", { exact: true })).toBeVisible();
  typeCard = page.locator("article").filter({ has: page.getByRole("heading", { name: renamedType, exact: true }) });
  page.once("dialog", (dialog) => dialog.accept());
  await typeCard.getByRole("button", { name: "Desactivar tipo de pieza" }).click();
  await expect(typeCard.getByText("Inactivo", { exact: true })).toBeVisible();

  const usedType = page.locator("article").filter({ has: page.getByRole("heading", { name: "Mainboard", exact: true }) });
  page.once("dialog", (dialog) => dialog.accept());
  await usedType.getByRole("button", { name: "Desactivar tipo de pieza" }).click();
  await expect(usedType.getByText(/No puedes desactivar este tipo de pieza porque está siendo utilizado/u)).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByText("Tipo de componente", { exact: true })).toHaveCount(0);
});
