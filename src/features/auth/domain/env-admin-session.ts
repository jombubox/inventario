export const ENV_ADMIN_ID = "env-admin";
export const ENV_ADMIN_AUDIT_ENTITY_ID = "00000000-0000-4000-8000-000000000001";
export const ENV_ADMIN_ROLE = "ADMIN" as const;

export const ENV_ADMIN_SESSION_COOKIE = "jombubox-admin-session";
export const ENV_ADMIN_SECURE_SESSION_COOKIE = "__Host-jombubox-admin-session";
export const ENV_ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export function envAdminSessionCookieName(production: boolean): string {
  return production ? ENV_ADMIN_SECURE_SESSION_COOKIE : ENV_ADMIN_SESSION_COOKIE;
}
