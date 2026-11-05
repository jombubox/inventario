// Isolated verification entry point: never reads a database URL from .env.local.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const url = new URL(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54330/jumbobox_test");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/jumbobox_test") throw new Error("Verification requires disposable local jumbobox_test PostgreSQL.");
const env = { ...process.env, TEST_DATABASE_URL: url.href, DATABASE_URL: url.href, APP_ENV: "preview", ADMIN_EMAIL: "admin@e2e.local", ADMIN_PASSWORD: "JombuBox-E2E-Admin-123!", AUTH_SECRET: "jombubox-e2e-secret-at-least-32-characters", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000", ENABLE_IMPORTS: "true", R2_PUBLIC_URL: "http://127.0.0.1:5555/jombubox-e2e", CLOUDFLARE_ACCOUNT_ID: "http://127.0.0.1:5555", R2_ACCESS_KEY_ID: "e2e-access-key", R2_SECRET_ACCESS_KEY: "e2e-secret-key", R2_BUCKET_NAME: "jombubox-e2e", NEON_LOCAL_WS_PROXY: `127.0.0.1:4445/v1?address=host.docker.internal:${url.port || "5432"}`, NEON_LOCAL_WS_POOL_REUSE: "true" };
const commands = { test: ["vitest/vitest.mjs", "run"], integration: ["vitest/vitest.mjs", "run", "src/features/sales/server/sales.integration.test.ts", "src/db/sales-migration.integration.test.ts"], e2e: ["@playwright/test/cli.js", "test"], build: ["next/dist/bin/next", "build"], lint: ["eslint/bin/eslint.js", "."], typecheck: ["typescript/bin/tsc", "--noEmit"], migrate: ["drizzle-kit/bin.cjs", "migrate"] };
function run(args) { const result = spawnSync(process.execPath, [resolve("node_modules", args[0]), ...args.slice(1)], { env, stdio: "inherit" }); if (result.error) throw result.error; if (result.status !== 0) process.exit(result.status ?? 1); }
const mode = process.argv[2]; if (!Object.hasOwn(commands, mode)) throw new Error("Choose test, integration, e2e, build, lint, typecheck or migrate.");
if (mode === "e2e") run(["tsx/dist/cli.mjs", "src/scripts/seed-catalog-e2e.ts"]);
run([...commands[mode], ...process.argv.slice(3)]);
