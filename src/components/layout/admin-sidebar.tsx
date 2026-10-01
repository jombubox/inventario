import Link from "next/link";

import { AdminNavLink } from "@/components/layout/admin-nav-link";
import { adminNavigation } from "@/components/layout/admin-navigation";
import { Brand } from "@/components/layout/brand";
import { AdminQuickAddButton } from "@/features/inventory/components/quick-add-inventory";

const navigationSections = [
  ["workspace", "Espacio de trabajo"],
  ["catalog", "Catálogo"],
  ["organization", "Organización"],
  ["other", "Otros"],
] as const;

export function AdminSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-card md:flex">
      <div className="flex h-18 items-center border-b border-border px-6">
        <Link
          href="/admin"
          aria-label="JombuBox, tablero principal"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Brand admin />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 py-5" aria-label="Navegación de gestión">
        <AdminQuickAddButton className="mb-6 shadow-sm" />
        {navigationSections.map(([section, label], index) => (
          <div key={section} className={index === 0 ? "" : "mt-5 border-t border-border/70 pt-5"}>
            <p className="mb-2 px-3 text-label text-muted-foreground">{label}</p>
            <ul className="space-y-1">
              {adminNavigation.filter((item) => item.section === section).map((item) => (
                <li key={item.label}>
                  <AdminNavLink href={item.href} label={item.label} icon={item.icon} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
