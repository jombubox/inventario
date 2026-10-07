import { expect, type Locator } from "@playwright/test";

// Follow the real buttons; never manipulate React state or hide wizard screens.
export async function goToQuickAddStep(dialog: Locator, target: number) {
  const progress = dialog.getByRole("progressbar", { name: "Progreso de creación del producto" });
  if (await progress.count() === 0) return; // Existing-product inventory entry.
  let current = Number(await progress.getAttribute("aria-valuenow"));
  while (current !== target) {
    if (current === 1 && target > 1) {
      for (const id of ["quick-brand", "quick-componentType"]) {
        const select = dialog.locator(`#${id}`);
        if (!await select.inputValue()) {
          const value = await select.locator('option[value]:not([value=""])').first().getAttribute("value");
          if (!value) throw new Error(`Missing fixture options for ${id}`);
          await select.selectOption(value);
        }
      }
    }
    const next = current + (current < target ? 1 : -1);
    await dialog.getByRole("button", { name: current < target ? "Siguiente" : "Atrás", exact: true }).click();
    await expect(progress).toHaveAttribute("aria-valuenow", String(next));
    current = next;
  }
  if (target === 5) {
    const location = dialog.locator("#quick-location");
    if (!await location.inputValue()) {
      const warehouse = location.locator("option", { hasText: /^Almacén E2E$/u });
      const value = await (await warehouse.count() ? warehouse : location.locator('option[value]:not([value=""])').first()).getAttribute("value");
      if (value) await location.selectOption(value);
    }
  }
}
