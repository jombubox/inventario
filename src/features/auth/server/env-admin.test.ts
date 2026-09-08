import { afterEach, describe, expect, it } from "vitest";

import {
  ENV_ADMIN_ID,
  ENV_ADMIN_SESSION_MAX_AGE_SECONDS,
} from "@/features/auth/domain/env-admin-session";
import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "@/features/auth/server/admin-session";
import {
  getConfiguredAdmin,
  validateAdminCredentials,
} from "@/features/auth/server/env-admin";

const originalEnvironment = { ...process.env };

function configureAdmin() {
  process.env.APP_ENV = "development";
  process.env.BETTER_AUTH_SECRET = "test-session-secret-that-is-longer-than-32-characters";
  process.env.ADMIN_BOOTSTRAP_NAME = "ENV Admin";
  process.env.ADMIN_BOOTSTRAP_EMAIL = "admin@example.test";
  process.env.ADMIN_BOOTSTRAP_PASSWORD = "Never-Use-This-Test-Password-123!";
}

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("environment administrator", () => {
  it("fails closed when the runtime credentials are missing", () => {
    expect(() => validateAdminCredentials(
      "admin@example.test",
      "Never-Use-This-Test-Password-123!",
      {
        NODE_ENV: "test",
        BETTER_AUTH_SECRET: "test-session-secret-that-is-longer-than-32-characters",
      },
    )).toThrow(/ADMIN_BOOTSTRAP_EMAIL/u);
  });

  it("returns a safe virtual ADMIN identity", () => {
    configureAdmin();
    process.env.ADMIN_BOOTSTRAP_EMAIL = "  ADMIN@example.test  ";
    expect(getConfiguredAdmin()).toEqual({
      id: ENV_ADMIN_ID,
      name: "ENV Admin",
      email: "admin@example.test",
      role: "ADMIN",
      active: true,
    });
    expect(getConfiguredAdmin()).not.toHaveProperty("password");
  });

  it("validates both credentials without disclosing which one failed", () => {
    configureAdmin();
    expect(validateAdminCredentials(
      "  ADMIN@example.test  ",
      "Never-Use-This-Test-Password-123!",
    )).toBe(true);
    expect(validateAdminCredentials(
      "wrong@example.test",
      "Never-Use-This-Test-Password-123!",
    )).toBe(false);
    expect(validateAdminCredentials("admin@example.test", "wrong-password")).toBe(false);
  });

  it("signs, expires, and invalidates sessions when the password changes", () => {
    configureAdmin();
    const now = Date.UTC(2026, 8, 7, 12);
    const token = createAdminSessionToken(now);
    expect(token).not.toContain(process.env.ADMIN_BOOTSTRAP_PASSWORD!);
    expect(verifyAdminSessionToken(token, now)?.id).toBe(ENV_ADMIN_ID);
    expect(
      verifyAdminSessionToken(
        token,
        now + (ENV_ADMIN_SESSION_MAX_AGE_SECONDS + 1) * 1_000,
      ),
    ).toBeNull();

    process.env.ADMIN_BOOTSTRAP_PASSWORD = "A-Different-Test-Password-456!";
    expect(verifyAdminSessionToken(token, now)).toBeNull();
  });

  it("rejects a tampered session", () => {
    configureAdmin();
    const token = createAdminSessionToken();
    expect(verifyAdminSessionToken(`${token.slice(0, -1)}x`)).toBeNull();
  });
});
