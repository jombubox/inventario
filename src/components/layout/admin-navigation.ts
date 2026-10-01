export type AdminNavigationItem = {
  label: string;
  href: string;
  icon: "home" | "inventory" | "products" | "brands" | "types" | "locations" | "import" | "movements" | "audit";
  section: "workspace" | "catalog" | "organization" | "other";
};

export const adminNavigation: readonly AdminNavigationItem[] = [
  { label: "Tablero principal", icon: "home", section: "workspace", href: "/admin" },
  { label: "Inventario", icon: "inventory", section: "workspace", href: "/admin/inventario" },
  { label: "Productos", icon: "products", section: "catalog", href: "/admin/productos" },
  { label: "Marcas", icon: "brands", section: "catalog", href: "/admin/marcas" },
  { label: "Tipos de pieza", icon: "types", section: "catalog", href: "/admin/tipos-de-pieza" },
  { label: "Ubicaciones", icon: "locations", section: "organization", href: "/admin/ubicaciones" },
  { label: "Importar", icon: "import", section: "other", href: "/admin/importar" },
  { label: "Movimientos", icon: "movements", section: "other", href: "/admin/movimientos" },
  { label: "Auditoría", icon: "audit", section: "other", href: "/admin/auditoria" },
] as const;
