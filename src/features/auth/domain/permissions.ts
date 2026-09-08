import { ForbiddenError } from "@/features/auth/domain/auth-errors";

export const userRoleValues = ["ADMIN", "EDITOR", "VIEWER"] as const;
export type UserRole = (typeof userRoleValues)[number];

export const permissionValues = [
  "DASHBOARD_VIEW",
  "PRODUCT_READ",
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "PRODUCT_ARCHIVE",
  "INVENTORY_READ",
  "INVENTORY_CREATE",
  "INVENTORY_UPDATE",
  "INVENTORY_MOVE",
  "INVENTORY_IN",
  "INVENTORY_OUT",
  "INVENTORY_EXPORT",
  "MOVEMENT_READ",
  "LOCATION_READ",
  "LOCATION_CREATE",
  "LOCATION_UPDATE",
  "USER_READ",
  "USER_MANAGE",
  "AUDIT_READ",
  "IMPORT_READ",
  "IMPORT_EXECUTE",
  "IMAGE_MANAGE",
] as const;

export type Permission = (typeof permissionValues)[number];

const editorPermissions: readonly Permission[] = [
  "DASHBOARD_VIEW",
  "PRODUCT_READ",
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "PRODUCT_ARCHIVE",
  "INVENTORY_READ",
  "INVENTORY_CREATE",
  "INVENTORY_UPDATE",
  "INVENTORY_MOVE",
  "INVENTORY_IN",
  "INVENTORY_OUT",
  "INVENTORY_EXPORT",
  "MOVEMENT_READ",
  "LOCATION_READ",
  "LOCATION_CREATE",
  "LOCATION_UPDATE",
  "IMPORT_READ",
  "IMPORT_EXECUTE",
  "IMAGE_MANAGE",
];

const viewerPermissions: readonly Permission[] = [
  "DASHBOARD_VIEW",
  "PRODUCT_READ",
  "INVENTORY_READ",
  "MOVEMENT_READ",
  "LOCATION_READ",
  "IMPORT_READ",
];

export const permissionMatrix: Readonly<Record<UserRole, readonly Permission[]>> = {
  ADMIN: permissionValues,
  EDITOR: editorPermissions,
  VIEWER: viewerPermissions,
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && userRoleValues.includes(value as UserRole);
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return permissionMatrix[role].includes(permission);
}

export function assertPermission(role: UserRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError("The current role does not have this permission.");
  }
}
