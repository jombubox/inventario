import Link from "next/link";

import { AdminNavLink } from "@/components/layout/admin-nav-link";
import { adminNavigation } from "@/components/layout/admin-navigation";
import { Brand } from "@/components/layout/brand";
import { Badge } from "@/components/ui/badge";

export function AdminSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-card md:flex">
      <div className="flex h-18 items-center border-b border-border px-6">
        <Link
          href="/admin"
          aria-label="JombuBox Admin, dashboard"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Brand admin />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 py-5" aria-label="Navegación de administración">
        <p className="mb-3 px-3 text-label uppercase tracking-[0.14em] text-muted-foreground">
          Espacio de trabajo
        </p>
        <ul className="space-y-1">
          {adminNavigation.map((item) => (
            <li key={item.label}>
              <AdminNavLink href={item.href} label={item.label} short={item.short} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-border p-5">
        <div className="rounded-xl bg-muted p-4">
          <Badge variant="primary">MVP</Badge>
          <p className="mt-2 text-small font-semibold text-navy">Operación administrativa</p>
          <p className="mt-1 text-small text-muted-foreground">
            Acceso, catálogo e inventario protegidos.
          </p>
        </div>
      </div>
    </aside>
  );
}
