import { createDatabaseClient } from "@/db/connection";
import { createJombuBoxAuth } from "@/lib/auth-factory";
import { parseServerEnv } from "@/lib/env-schema";

const environment = parseServerEnv(process.env);

export const auth = createJombuBoxAuth(createDatabaseClient(environment.DATABASE_URL), {
  secret: environment.BETTER_AUTH_SECRET,
  baseURL: environment.BETTER_AUTH_URL,
  siteURL: environment.NEXT_PUBLIC_SITE_URL,
  secureCookies: environment.APP_ENV === "production",
});
