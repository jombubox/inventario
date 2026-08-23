import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

import * as schema from "@/db/schema";
import {
  authAccessControl,
  authAdminRole,
  authEditorRole,
  authViewerRole,
} from "@/features/auth/domain/permissions";

type DrizzleAuthDatabase = Parameters<typeof drizzleAdapter>[0];

export function createJombuBoxAuth(
  database: DrizzleAuthDatabase,
  environment: {
    secret: string;
    baseURL?: string;
    siteURL?: string;
    secureCookies?: boolean;
  },
) {
  const trustedOrigins = [...new Set([environment.baseURL, environment.siteURL].filter(
    (value): value is string => Boolean(value),
  ))];

  return betterAuth({
    appName: "JombuBox",
    baseURL: environment.baseURL,
    secret: environment.secret,
    trustedOrigins,
    database: drizzleAdapter(database, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        active: {
          type: "boolean",
          required: true,
          defaultValue: true,
          input: false,
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: environment.secureCookies,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-real-ip"] },
    },
    plugins: [
      admin({
        ac: authAccessControl,
        roles: {
          ADMIN: authAdminRole,
          EDITOR: authEditorRole,
          VIEWER: authViewerRole,
        },
        defaultRole: "VIEWER",
      }),
      nextCookies(),
    ],
  });
}
