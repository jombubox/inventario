import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

const optionalAdminName = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).max(120).optional(),
);

const optionalAdminEmail = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.email().transform((value) => value.toLowerCase()).optional(),
);

const optionalAdminPassword = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(16).max(128).optional(),
);

const booleanEnvironmentValue = z.preprocess(
  (value) => {
    if (value === undefined || value === "") return true;
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return value;
  },
  z.boolean(),
);

export const databaseEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must be a PostgreSQL connection string",
    ),
});

const serverEnvironmentShape = databaseEnvSchema.extend({
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: optionalUrl,
  NEXT_PUBLIC_SITE_URL: optionalUrl,
  ENABLE_IMPORTS: booleanEnvironmentValue,
  ADMIN_BOOTSTRAP_NAME: optionalAdminName,
  ADMIN_BOOTSTRAP_EMAIL: optionalAdminEmail,
  ADMIN_BOOTSTRAP_PASSWORD: optionalAdminPassword,
  CLOUDFLARE_ACCOUNT_ID: optionalSecret,
  R2_ACCESS_KEY_ID: optionalSecret,
  R2_SECRET_ACCESS_KEY: optionalSecret,
  R2_BUCKET_NAME: optionalSecret,
  R2_PUBLIC_URL: optionalUrl,
});

export const serverEnvSchema = serverEnvironmentShape.superRefine((environment, context) => {
  if (environment.APP_ENV !== "production") return;

  for (const [key, value] of [
    ["ADMIN_BOOTSTRAP_NAME", environment.ADMIN_BOOTSTRAP_NAME],
    ["ADMIN_BOOTSTRAP_EMAIL", environment.ADMIN_BOOTSTRAP_EMAIL],
    ["ADMIN_BOOTSTRAP_PASSWORD", environment.ADMIN_BOOTSTRAP_PASSWORD],
  ] as const) {
    if (!value) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `${key} is required in production`,
      });
    }
  }

  for (const [key, value] of [
    ["BETTER_AUTH_URL", environment.BETTER_AUTH_URL],
    ["NEXT_PUBLIC_SITE_URL", environment.NEXT_PUBLIC_SITE_URL],
  ] as const) {
    if (!value) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `${key} is required in production`,
      });
      continue;
    }
    const url = new URL(value);
    if (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname)) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `${key} must be a non-local HTTPS origin in production`,
      });
    }
  }

  if (
    environment.BETTER_AUTH_URL &&
    environment.NEXT_PUBLIC_SITE_URL &&
    new URL(environment.BETTER_AUTH_URL).origin !==
      new URL(environment.NEXT_PUBLIC_SITE_URL).origin
  ) {
    context.addIssue({
      code: "custom",
      path: ["BETTER_AUTH_URL"],
      message: "BETTER_AUTH_URL and NEXT_PUBLIC_SITE_URL must share an origin",
    });
  }

  for (const [key, value] of [
    ["CLOUDFLARE_ACCOUNT_ID", environment.CLOUDFLARE_ACCOUNT_ID],
    ["R2_ACCESS_KEY_ID", environment.R2_ACCESS_KEY_ID],
    ["R2_SECRET_ACCESS_KEY", environment.R2_SECRET_ACCESS_KEY],
    ["R2_BUCKET_NAME", environment.R2_BUCKET_NAME],
    ["R2_PUBLIC_URL", environment.R2_PUBLIC_URL],
  ] as const) {
    if (!value) {
      context.addIssue({ code: "custom", path: [key], message: `${key} is required in production` });
    }
  }

  if (environment.R2_PUBLIC_URL) {
    const url = new URL(environment.R2_PUBLIC_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      context.addIssue({
        code: "custom",
        path: ["R2_PUBLIC_URL"],
        message: "R2_PUBLIC_URL must be a public HTTPS base URL without credentials, query or hash in production",
      });
    }
  }
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatEnvironmentError(error: z.ZodError): Error {
  const details = error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  return new Error(`Invalid server environment: ${details}`);
}

export function parseDatabaseEnv(environment: NodeJS.ProcessEnv): DatabaseEnv {
  const result = databaseEnvSchema.safeParse(environment);

  if (!result.success) {
    throw formatEnvironmentError(result.error);
  }

  return result.data;
}

export function parseServerEnv(environment: NodeJS.ProcessEnv): ServerEnv {
  const result = serverEnvSchema.safeParse(environment);

  if (!result.success) {
    throw formatEnvironmentError(result.error);
  }

  return result.data;
}
