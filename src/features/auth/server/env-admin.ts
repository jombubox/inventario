import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { ENV_ADMIN_ID, ENV_ADMIN_ROLE } from "@/features/auth/domain/env-admin-session";

const adminIdentitySchema = z.object({
  ADMIN_BOOTSTRAP_NAME: z.string().trim().min(1).max(120),
  ADMIN_BOOTSTRAP_EMAIL: z
    .string()
    .trim()
    .pipe(z.email())
    .transform((value) => value.toLowerCase()),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(16).max(128),
});

const adminSessionEnvironmentSchema = adminIdentitySchema.extend({
  BETTER_AUTH_SECRET: z.string().min(32),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),
});

export type ConfiguredAdmin = {
  id: typeof ENV_ADMIN_ID;
  name: string;
  email: string;
  role: typeof ENV_ADMIN_ROLE;
  active: true;
};

export class InvalidEnvAdminConfigurationError extends Error {
  override readonly name = "InvalidEnvAdminConfigurationError";

  constructor(readonly fields: readonly string[]) {
    super(`Invalid ENV admin configuration: ${fields.join(", ")}`);
  }
}

function parseAdminIdentity(environment: NodeJS.ProcessEnv) {
  const result = adminIdentitySchema.safeParse(environment);
  if (!result.success) {
    throw new InvalidEnvAdminConfigurationError([
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ]);
  }
  return result.data;
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function safeAdmin(identity: z.infer<typeof adminIdentitySchema>): ConfiguredAdmin {
  return {
    id: ENV_ADMIN_ID,
    name: identity.ADMIN_BOOTSTRAP_NAME,
    email: identity.ADMIN_BOOTSTRAP_EMAIL,
    role: ENV_ADMIN_ROLE,
    active: true,
  };
}

export function getConfiguredAdmin(
  environment: NodeJS.ProcessEnv = process.env,
): ConfiguredAdmin {
  return safeAdmin(parseAdminIdentity(environment));
}

export function validateAdminCredentials(
  email: string,
  password: string,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const identity = parseAdminIdentity(environment);
  const emailMatches = constantTimeTextEqual(
    email.trim().toLowerCase(),
    identity.ADMIN_BOOTSTRAP_EMAIL,
  );
  const passwordMatches = constantTimeTextEqual(
    password,
    identity.ADMIN_BOOTSTRAP_PASSWORD,
  );
  return emailMatches && passwordMatches;
}

export function getAdminSessionConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const result = adminSessionEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new InvalidEnvAdminConfigurationError([
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ]);
  }

  const signingKey = createHmac("sha256", result.data.BETTER_AUTH_SECRET)
    .update("jombubox:env-admin:session-key:v1\0", "utf8")
    .update(result.data.ADMIN_BOOTSTRAP_PASSWORD, "utf8")
    .digest();

  return {
    admin: safeAdmin(result.data),
    production: result.data.APP_ENV === "production",
    signingKey,
  };
}
