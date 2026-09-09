import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setCookie: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.setCookie }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  logout,
  requireAdmin,
  validateAdminCredentials,
  verifyAdminSession,
} from "@/features/auth/server/admin-auth";

const now = Date.UTC(2026, 8, 8, 12);

function configureAuth() {
  vi.stubEnv("ADMIN_EMAIL", "  admin@example.test  ");
  vi.stubEnv("ADMIN_PASSWORD", "Exact-Test-Password");
  vi.stubEnv("AUTH_SECRET", "test-session-secret-that-is-longer-than-32-characters");
}

async function createToken(sessionTime = now): Promise<string> {
  await createAdminSession(sessionTime);
  const token = mocks.setCookie.mock.calls.at(-1)?.[1];
  if (typeof token !== "string") throw new Error("Session cookie was not created.");
  return token;
}

beforeEach(() => {
  configureAuth();
  mocks.setCookie.mockClear();
  mocks.redirect.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("single administrator authentication", () => {
  it("validates the email case-insensitively and the password exactly", async () => {
    await expect(validateAdminCredentials("ADMIN@example.test", "Exact-Test-Password"))
      .resolves.toBe(true);
    await expect(validateAdminCredentials("wrong@example.test", "Exact-Test-Password"))
      .resolves.toBe(false);
    await expect(validateAdminCredentials("admin@example.test", "exact-test-password"))
      .resolves.toBe(false);
  });

  it("fails safely when credentials are not configured", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    await expect(validateAdminCredentials("admin@example.test", "Exact-Test-Password"))
      .rejects.toThrow("Admin authentication is not configured");
  });

  it("creates and verifies a minimal twelve-hour HMAC session", async () => {
    const token = await createToken();
    const [payload] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));

    expect(decoded).toEqual({ admin: true, exp: Math.floor(now / 1_000) + 43_200 });
    expect(mocks.setCookie).toHaveBeenCalledWith(
      ADMIN_SESSION_COOKIE,
      token,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 43_200 }),
    );
    await expect(verifyAdminSession(token, now)).resolves.toBe(true);
    await expect(verifyAdminSession(token, now + 43_200_000)).resolves.toBe(false);
    await expect(verifyAdminSession(`${token.slice(0, -1)}x`, now)).resolves.toBe(false);
  });

  it("invalidates sessions when AUTH_SECRET changes", async () => {
    const token = await createToken();
    vi.stubEnv("AUTH_SECRET", "a-different-session-secret-that-is-at-least-32-characters");
    await expect(verifyAdminSession(token, now)).resolves.toBe(false);
  });

  it("marks the session cookie secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createAdminSession(now);
    expect(mocks.setCookie).toHaveBeenCalledWith(
      ADMIN_SESSION_COOKIE,
      expect.any(String),
      expect.objectContaining({ secure: true }),
    );
  });

  it("authorizes signed request cookies without loading a user", async () => {
    const token = await createToken(Date.now());
    await expect(requireAdmin(new Headers({ cookie: `${ADMIN_SESSION_COOKIE}=${token}` })))
      .resolves.toBeUndefined();
    await expect(requireAdmin(new Headers())).rejects.toThrow("Authentication is required");
  });

  it("expires the only session cookie on logout", async () => {
    await expect(logout()).rejects.toThrow("redirect:/login");
    expect(mocks.setCookie).toHaveBeenCalledWith(
      ADMIN_SESSION_COOKIE,
      "",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 }),
    );
  });
});
