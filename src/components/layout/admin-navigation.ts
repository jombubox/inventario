export type AdminNavigationItem = {
  label: string;
  href: string;
  short: string;
};

export const adminNavigation: readonly AdminNavigationItem[] = [
  { label: "Dashboard", short: "DB", href: "/admin" },
  { label: "Productos", short: "PR", href: "/admin/productos" },
  { label: "Inventario", short: "IN", href: "/admin/inventario" },
  { label: "Ubicaciones", short: "UB", href: "/admin/ubicaciones" },
  { label: "Importar", short: "IM", href: "/admin/importar" },
  { label: "Movimientos", short: "MV", href: "/admin/movimientos" },
  { label: "Auditoría", short: "AU", href: "/admin/auditoria" },
] as const;
