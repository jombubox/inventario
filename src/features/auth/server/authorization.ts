import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/auth/domain/auth-errors";
import {
  hasPermission,
  isUserRole,
  type Permission,
  type UserRole,
} from "@/features/auth/domain/permissions";
import { auth } from "@/lib/auth";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
};

export async function getAuthenticatedUserFromHeaders(
  requestHeaders: Headers,
): Promise<AuthenticatedUser | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session || !session.user.active || !isUserRole(session.user.role)) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    active: session.user.active,
  };
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  return getAuthenticatedUserFromHeaders(await headers());
}

export async function requireSession(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();

  if (!user) {
    throw new UnauthorizedError("Authentication is required.");
  }

  return user;
}

export async function requireAdminPageSession(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  return user;
}

export async function requirePermission(permission: Permission): Promise<AuthenticatedUser> {
  const user = await requireSession();

  if (!hasPermission(user.role, permission)) {
    throw new ForbiddenError("The current role does not have this permission.");
  }

  return user;
}

export async function requirePagePermission(
  permission: Permission,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login?next=/admin");
  }
  if (!hasPermission(user.role, permission)) {
    redirect("/admin/forbidden");
  }

  return user;
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  return requirePermission("USER_MANAGE");
}

export async function requirePermissionFromHeaders(
  requestHeaders: Headers,
  permission: Permission,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUserFromHeaders(requestHeaders);
  if (!user) throw new UnauthorizedError("Authentication is required.");
  if (!hasPermission(user.role, permission)) {
    throw new ForbiddenError("The current role does not have this permission.");
  }
  return user;
}
