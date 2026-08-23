import Link from "next/link";

import { Brand } from "@/components/layout/brand";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          aria-label="JombuBox, página de inicio"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          <Brand />
        </Link>
        <nav aria-label="Navegación principal" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/catalogo"
            className="rounded-lg px-3 py-2 text-small font-semibold text-foreground transition-colors hover:bg-muted hover:text-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Catálogo
          </Link>
          <Link
            href="/admin"
            className="hidden rounded-lg px-3 py-2 text-small font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
