import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";

import {
  ENV_ADMIN_SECURE_SESSION_COOKIE,
  ENV_ADMIN_SESSION_COOKIE,
  ENV_ADMIN_ID,
  ENV_ADMIN_ROLE,
  ENV_ADMIN_SESSION_MAX_AGE_SECONDS,
  envAdminSessionCookieName,
} from "@/features/auth/domain/env-admin-session";
import {
  getAdminSessionConfiguration,
  type ConfiguredAdmin,
} from "@/features/auth/server/env-admin";

const sessionPayloadSchema = z.object({
  version: z.literal(1),
  sub: z.literal(ENV_ADMIN_ID),
  role: z.literal(ENV_ADMIN_ROLE),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();

function signPayload(payload: string, signingKey: Buffer): Buffer {
  return createHmac("sha256", signingKey).update(payload, "utf8").digest();
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1 || item.slice(0, separator).trim() !== name) continue;
    return item.slice(separator + 1).trim() || null;
  }
  return null;
}

export function createAdminSessionToken(now = Date.now()): string {
  const { signingKey } = getAdminSessionConfiguration();
  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    sub: ENV_ADMIN_ID,
    role: ENV_ADMIN_ROLE,
    issuedAt,
    expiresAt: issuedAt + ENV_ADMIN_SESSION_MAX_AGE_SECONDS,
  }), "utf8").toString("base64url");
  const signature = signPayload(payload, signingKey).toString("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdminSessionToken(
  token: string | null | undefined,
  now = Date.now(),
): ConfiguredAdmin | null {
  if (!token || token.length > 2_048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, encodedSignature] = parts;
  if (!payload || !encodedSignature) return null;

  try {
    const { admin, signingKey } = getAdminSessionConfiguration();
    const expectedSignature = signPayload(payload, signingKey);
    const actualSignature = Buffer.from(encodedSignature, "base64url");
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return null;
    }

    const parsed = sessionPayloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (!parsed.success) return null;
    const nowSeconds = Math.floor(now / 1000);
    if (
      parsed.data.issuedAt > nowSeconds + 60 ||
      parsed.data.expiresAt <= nowSeconds ||
      parsed.data.expiresAt - parsed.data.issuedAt !== ENV_ADMIN_SESSION_MAX_AGE_SECONDS
    ) {
      return null;
    }
    return admin;
  } catch {
    return null;
  }
}

export function getAdminSessionFromHeaders(requestHeaders: Headers): ConfiguredAdmin | null {
  try {
    const { production } = getAdminSessionConfiguration();
    const token = readCookie(
      requestHeaders.get("cookie"),
      envAdminSessionCookieName(production),
    );
    return verifyAdminSessionToken(token);
  } catch {
    return null;
  }
}

export async function createAdminSession(): Promise<void> {
  const { production } = getAdminSessionConfiguration();
  const cookieStore = await cookies();
  cookieStore.set(envAdminSessionCookieName(production), createAdminSessionToken(), {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: ENV_ADMIN_SESSION_MAX_AGE_SECONDS,
    priority: "high",
  });
}

export async function deleteAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  for (const [name, secure] of [
    [ENV_ADMIN_SESSION_COOKIE, false],
    [ENV_ADMIN_SECURE_SESSION_COOKIE, true],
  ] as const) {
    cookieStore.set(name, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}
