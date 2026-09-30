import Link from "next/link";

import { AdminNavLink } from "@/components/layout/admin-nav-link";
import { adminNavigation } from "@/components/layout/admin-navigation";
import { Brand } from "@/components/layout/brand";
import { AdminQuickAddButton } from "@/features/inventory/components/quick-add-inventory";

export function AdminSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-card md:flex">
      <div className="flex h-18 items-center border-b border-border px-6">
        <Link
          href="/admin"
          aria-label="JombuBox Admin, resumen"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Brand admin />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 py-5" aria-label="Navegación de administración">
        <AdminQuickAddButton className="mb-6 shadow-sm" />
        <p className="mb-3 px-3 text-label uppercase tracking-[0.14em] text-muted-foreground">Espacio de trabajo</p>
        <ul className="space-y-1">
          {adminNavigation.filter((item) => item.section === "workspace").map((item) => (
            <li key={item.label}><AdminNavLink href={item.href} label={item.label} icon={item.icon} /></li>
          ))}
        </ul>
        <div className="my-5 border-t border-border" />
        <p className="mb-3 px-3 text-label uppercase tracking-[0.14em] text-muted-foreground">Otros</p>
        <ul className="space-y-1">
          {adminNavigation.filter((item) => item.section === "other").map((item) => (
            <li key={item.label}><AdminNavLink href={item.href} label={item.label} icon={item.icon} /></li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-border p-5">
        <div className="rounded-xl bg-muted p-4">
          <p className="text-small font-semibold text-navy">Panel de administrador</p>
          <p className="mt-1 text-small text-muted-foreground">Este panel de control es de uso exclusivo de personal autorizado. No es visible al público.</p>
        </div>
      </div>
    </aside>
  );
}
