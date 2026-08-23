import { AdminNavLink } from "@/components/layout/admin-nav-link";
import { navigationForRole } from "@/components/layout/admin-navigation";
import type { UserRole } from "@/features/auth/domain/permissions";

export function AdminMobileNav({ role }: { role: UserRole }) {
  return (
    <nav
      aria-label="Navegación móvil de administración"
      className="admin-mobile-nav overflow-x-auto border-b border-border bg-card md:hidden"
    >
      <ul className="flex min-w-max gap-1 px-4 py-2">
        {navigationForRole(role)
          .filter((item) => item.href)
          .map((item) => (
            <li key={item.label}>
              <AdminNavLink
                href={item.href!}
                label={item.label}
                short={item.short}
                mobile
              />
            </li>
          ))}
      </ul>
    </nav>
  );
}
