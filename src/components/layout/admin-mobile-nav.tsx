import { AdminNavLink } from "@/components/layout/admin-nav-link";
import { adminNavigation } from "@/components/layout/admin-navigation";
import { AdminQuickAddButton } from "@/features/inventory/components/quick-add-inventory";

export function AdminMobileNav() {
  return (
    <nav aria-label="Navegación móvil de gestión" className="admin-mobile-nav border-b border-border bg-card md:hidden">
      <div className="px-4 pt-3"><AdminQuickAddButton compact /></div>
      <div className="overflow-x-auto">
        <ul className="flex min-w-max gap-1 px-4 py-2">
          {adminNavigation.map((item) => (
            <li key={item.label}>
              <AdminNavLink href={item.href} label={item.label} icon={item.icon} mobile />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
