import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/server/actions";

export function AdminHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex min-h-18 items-center justify-between gap-4 px-5 py-3 sm:px-7 lg:px-9">
        <Link
          href="/admin"
          aria-label="JombuBox, tablero principal"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          <Brand admin />
        </Link>
        <div className="hidden min-w-0 md:block">
          <p className="truncate text-small font-semibold text-navy">JombuBox</p>
          <p className="truncate text-small text-muted-foreground">Gestión de inventario</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">Salir</Button>
          </form>
        </div>
      </div>
    </header>
  );
}
