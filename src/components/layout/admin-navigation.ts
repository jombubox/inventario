import type { UserRole } from "@/features/auth/domain/permissions";

export type AdminNavigationItem = {
  label: string;
  href: string;
  short: string;
  roles?: readonly UserRole[];
};

export const adminNavigation: readonly AdminNavigationItem[] = [
  { label: "Dashboard", short: "DB", href: "/admin" },
  { label: "Productos", short: "PR", href: "/admin/productos" },
  { label: "Inventario", short: "IN", href: "/admin/inventario" },
  { label: "Ubicaciones", short: "UB", href: "/admin/ubicaciones" },
  { label: "Importar", short: "IM", href: "/admin/importar" },
  { label: "Movimientos", short: "MV", href: "/admin/movimientos" },
  { label: "Administrador", short: "AD", href: "/admin/usuarios", roles: ["ADMIN"] },
  { label: "Auditoría", short: "AU", href: "/admin/auditoria", roles: ["ADMIN"] },
] as const;

export function navigationForRole(role: UserRole) {
  return adminNavigation.filter((item) => !item.roles || item.roles.includes(role));
}
