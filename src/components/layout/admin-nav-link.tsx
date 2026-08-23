"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

export function AdminNavLink({
  href,
  label,
  short,
  mobile = false,
}: {
  href: string;
  label: string;
  short: string;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const active = href === "/admin" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        mobile ? "min-h-10 px-3 text-small" : "min-h-11 px-3 text-small",
        active
          ? "bg-primary-soft text-primary-active"
          : "text-muted-foreground hover:bg-muted hover:text-navy",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg text-[0.625rem] font-bold tracking-wide",
          active ? "bg-primary text-white" : "bg-muted text-muted-foreground group-hover:bg-card",
        )}
        aria-hidden="true"
      >
        {short}
      </span>
      {label}
    </Link>
  );
}
