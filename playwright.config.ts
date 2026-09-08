import { defineConfig, devices } from "@playwright/test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_SECRET ??= "jombubox-e2e-secret-at-least-32-characters";
process.env.BETTER_AUTH_URL ??= "http://127.0.0.1:3000";
process.env.NEXT_PUBLIC_SITE_URL ??= "http://127.0.0.1:3000";
process.env.ADMIN_BOOTSTRAP_NAME ??= "Admin E2E";
process.env.ADMIN_BOOTSTRAP_EMAIL ??= "admin@e2e.local";
process.env.ADMIN_BOOTSTRAP_PASSWORD ??= "JombuBox-E2E-Admin-123!";
process.env.NEON_LOCAL_WS_PROXY ??= "127.0.0.1:4445/v1?address=host.docker.internal:54330";
process.env.NEON_LOCAL_WS_POOL_REUSE ??= "true";
process.env.CLOUDFLARE_ACCOUNT_ID ??= "http://127.0.0.1:5555";
process.env.R2_ACCESS_KEY_ID ??= "e2e-access-key";
process.env.R2_SECRET_ACCESS_KEY ??= "e2e-secret-key";
process.env.R2_BUCKET_NAME ??= "jombubox-e2e";
process.env.R2_PUBLIC_URL ??= "http://127.0.0.1:5555/jombubox-e2e";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
      : [
        {
          command: 'docker run --rm --name jombubox-e2e-wsproxy --add-host=host.docker.internal:host-gateway -e "ALLOW_ADDR_REGEX=^host\\.docker\\.internal:(54330|5432)$" -p 127.0.0.1:4445:80 -p 127.0.0.1:4446:2112 ghcr.io/neondatabase/wsproxy:latest',
          url: "http://127.0.0.1:4446/metrics",
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: "node src/scripts/fake-r2.mjs",
          url: "http://127.0.0.1:5555/health",
          reuseExistingServer: false,
          timeout: 30_000,
        },
        {
          command: "pnpm dev --hostname 127.0.0.1",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
