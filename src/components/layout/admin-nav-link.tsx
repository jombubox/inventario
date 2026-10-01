"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

type AdminIcon = "home" | "inventory" | "products" | "brands" | "types" | "locations" | "import" | "movements" | "audit";

function NavIcon({ icon }: { icon: AdminIcon }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
    inventory: <><path d="M4 7h16v13H4z" /><path d="M7 4h10l3 3H4z" /><path d="M9 11h6" /></>,
    products: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
    brands: <><path d="M4 6h16v12H4z" /><path d="M7 10h10M7 14h6" /></>,
    types: <><path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" /></>,
    locations: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    import: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></>,
    movements: <><path d="M4 7h14" /><path d="m14 3 4 4-4 4" /><path d="M20 17H6" /><path d="m10 13-4 4 4 4" /></>,
    audit: <><path d="M9 4h6" /><path d="M9 2h6v4H9z" /><path d="M6 4H4v17h16V4h-2" /><path d="m8 13 2 2 5-5" /></>,
  } as const;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">{paths[icon]}</svg>;
}

export function AdminNavLink({
  href,
  label,
  icon,
  mobile = false,
}: {
  href: string;
  label: string;
  icon: AdminIcon;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const active = href === "/admin" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        mobile ? "min-h-10 px-3 text-small" : "min-h-11 px-3 text-small",
        active
          ? "bg-primary-soft text-primary-active"
          : "text-muted-foreground hover:bg-muted hover:text-navy",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg",
          active ? "text-primary" : "text-muted-foreground group-hover:text-navy",
        )}
        aria-hidden="true"
      >
        <NavIcon icon={icon} />
      </span>
      {label}
    </Link>
  );
}
