import { describe, expect, it } from "vitest";

import { parseDatabaseEnv, parseServerEnv } from "@/lib/env-schema";

const base = {
  NODE_ENV: "test" as const,
  DATABASE_URL: "postgresql://user:password@localhost/jombubox",
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

  it("keeps admin authentication outside the general environment boundary", () => {
    const parsed = parseServerEnv({
      ...base,
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "a-development-only-password",
      AUTH_SECRET: "a-secure-secret-with-at-least-32-characters",
    });
    expect(parsed).not.toHaveProperty("ADMIN_EMAIL");
    expect(parsed).not.toHaveProperty("ADMIN_PASSWORD");
    expect(parsed).not.toHaveProperty("AUTH_SECRET");
  });

  it("validates database configuration without unrelated runtime settings", () => {
    expect(parseDatabaseEnv({
      NODE_ENV: "production",
      DATABASE_URL: base.DATABASE_URL,
    })).toEqual({ DATABASE_URL: base.DATABASE_URL });
    expect(() => parseDatabaseEnv({ NODE_ENV: "production" })).toThrow(
      /DATABASE_URL is required/u,
    );
  });

  it("does not make production runtime validation depend on admin settings", () => {
    expect(parseServerEnv({
      ...base,
      APP_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://jombubox.example",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "secret-key",
      R2_BUCKET_NAME: "jombubox-products",
      R2_PUBLIC_URL: "https://images.jombubox.example",
    }).APP_ENV).toBe("production");
  });

  it("requires a non-local HTTPS site origin in production", () => {
    expect(() => parseServerEnv({ ...base, APP_ENV: "production" })).toThrow(/NEXT_PUBLIC_SITE_URL/u);
    expect(() => parseServerEnv({
      ...base,
      APP_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://jombubox.example",
    })).toThrow(/R2_ACCESS_KEY_ID/u);
    expect(parseServerEnv({
      ...base,
      APP_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://jombubox.example",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "secret-key",
      R2_BUCKET_NAME: "jombubox-products",
      R2_PUBLIC_URL: "https://images.jombubox.example",
    }).APP_ENV).toBe("production");
  });
});
