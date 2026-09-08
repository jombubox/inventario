import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/env-schema";

const base = {
  NODE_ENV: "test" as const,
  DATABASE_URL: "postgresql://user:password@localhost/jombubox",
  BETTER_AUTH_SECRET: "a-secure-secret-with-at-least-32-characters",
};

describe("server environment validation", () => {
  it("provides safe development defaults", () => {
    expect(parseServerEnv(base)).toMatchObject({
      APP_ENV: "development",
      ENABLE_IMPORTS: true,
    });
  });

  it("parses the import kill switch", () => {
    expect(parseServerEnv({ ...base, ENABLE_IMPORTS: "false" }).ENABLE_IMPORTS).toBe(false);
  });

  it("keeps runtime ENV-admin values optional during general environment parsing", () => {
    expect(parseServerEnv({
      ...base,
      ADMIN_BOOTSTRAP_NAME: "JombuBox Admin",
      ADMIN_BOOTSTRAP_EMAIL: "admin@example.com",
      ADMIN_BOOTSTRAP_PASSWORD: "a-development-only-password",
    })).toMatchObject({
      ADMIN_BOOTSTRAP_NAME: "JombuBox Admin",
      ADMIN_BOOTSTRAP_EMAIL: "admin@example.com",
      ADMIN_BOOTSTRAP_PASSWORD: "a-development-only-password",
    });
    expect(parseServerEnv(base).ADMIN_BOOTSTRAP_PASSWORD).toBeUndefined();
  });

  it("requires matching non-local HTTPS origins in production", () => {
    expect(() => parseServerEnv({ ...base, APP_ENV: "production" })).toThrow(/BETTER_AUTH_URL/u);
    expect(() => parseServerEnv({
      ...base,
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://admin.example.com",
      NEXT_PUBLIC_SITE_URL: "https://www.example.com",
    })).toThrow(/share an origin/u);
    expect(() => parseServerEnv({
      ...base,
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://jombubox.example",
      NEXT_PUBLIC_SITE_URL: "https://jombubox.example",
    })).toThrow(/R2_ACCESS_KEY_ID/u);
    expect(parseServerEnv({
      ...base,
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://jombubox.example",
      NEXT_PUBLIC_SITE_URL: "https://jombubox.example",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "secret-key",
      R2_BUCKET_NAME: "jombubox-products",
      R2_PUBLIC_URL: "https://images.jombubox.example",
    }).APP_ENV).toBe("production");
  });
});
