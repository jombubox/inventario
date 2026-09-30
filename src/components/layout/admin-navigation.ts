export type AdminNavigationItem = {
  label: string;
  href: string;
  icon: "home" | "inventory" | "products" | "locations" | "import" | "movements" | "audit";
  section: "workspace" | "other";
};

export const adminNavigation: readonly AdminNavigationItem[] = [
  { label: "Resumen", icon: "home", section: "workspace", href: "/admin" },
  { label: "Inventario", icon: "inventory", section: "workspace", href: "/admin/inventario" },
  { label: "Productos", icon: "products", section: "other", href: "/admin/productos" },
  { label: "Ubicaciones", icon: "locations", section: "other", href: "/admin/ubicaciones" },
  { label: "Importar", icon: "import", section: "other", href: "/admin/importar" },
  { label: "Movimientos", icon: "movements", section: "other", href: "/admin/movimientos" },
  { label: "Auditoría", icon: "audit", section: "other", href: "/admin/auditoria" },
] as const;
