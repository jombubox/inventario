import { expect, test } from "@playwright/test";

const viewports = [
  { width: 320, height: 720 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

test("public and login shells remain usable at release viewports", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "The desktop project explicitly exercises all eight release viewports.");

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/catalogo", "/login"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${viewport.width}px has horizontal overflow`).toBeLessThanOrEqual(1);
    }
  }
});

test("health and security headers expose no dependency details", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-request-id"]).toBeTruthy();
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(await response.json()).toEqual({ status: "ok" });
});
