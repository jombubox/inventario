import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
} from "@/features/auth/constants";
import { UnauthorizedError } from "@/features/auth/domain/auth-errors";

export { ADMIN_SESSION_COOKIE } from "@/features/auth/constants";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function requiredEnvironmentValue(name: "ADMIN_EMAIL" | "ADMIN_PASSWORD" | "AUTH_SECRET"): string {
  const value = process.env[name];
  if (!value || (name === "AUTH_SECRET" && value.length < 32)) {
    throw new Error("Admin authentication is not configured");
  }
  return value;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function textMatches(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return difference === 0;
}

function cookieFromHeader(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1 || item.slice(0, separator).trim() !== ADMIN_SESSION_COOKIE) continue;
    return item.slice(separator + 1).trim() || undefined;
  }
  return undefined;
}

export async function validateAdminCredentials(email: string, password: string): Promise<boolean> {
  const configuredEmail = requiredEnvironmentValue("ADMIN_EMAIL").trim().toLowerCase();
  const configuredPassword = requiredEnvironmentValue("ADMIN_PASSWORD");
  const [emailMatches, passwordMatches] = await Promise.all([
    textMatches(email.trim().toLowerCase(), configuredEmail),
    textMatches(password, configuredPassword),
  ]);
  return emailMatches && passwordMatches;
}

export async function createAdminSession(now = Date.now()): Promise<void> {
  const secret = requiredEnvironmentValue("AUTH_SECRET");
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({
    admin: true,
    exp: Math.floor(now / 1_000) + ADMIN_SESSION_MAX_AGE_SECONDS,
  })));
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload)),
  );
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, `${payload}.${encodeBase64Url(signature)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

export async function verifyAdminSession(
  token: string | null | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token || token.length > 2_048) return false;
  const [payload, encodedSignature, extra] = token.split(".");
  if (!payload || !encodedSignature || extra) return false;

  try {
    const secret = requiredEnvironmentValue("AUTH_SECRET");
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      decodeBase64Url(encodedSignature),
      encoder.encode(payload),
    );
    if (!validSignature) return false;

    const parsed: unknown = JSON.parse(decoder.decode(decodeBase64Url(payload)));
    if (!parsed || typeof parsed !== "object") return false;
    const session = parsed as Record<string, unknown>;
    return Object.keys(session).length === 2
      && session.admin === true
      && Number.isInteger(session.exp)
      && Number(session.exp) > Math.floor(now / 1_000);
  } catch {
    return false;
  }
}

export async function requireAdmin(requestHeaders?: Headers): Promise<void> {
  const token = requestHeaders
    ? cookieFromHeader(requestHeaders.get("cookie"))
    : (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (await verifyAdminSession(token)) return;
  if (requestHeaders) throw new UnauthorizedError("Authentication is required.");
  redirect("/login?next=/admin");
}

export async function logout(): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  redirect("/login");
}
