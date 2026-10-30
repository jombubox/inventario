import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { PublicMobileMenu } from "@/components/layout/public-mobile-menu";
import { WhatsAppLink } from "@/components/ui/whatsapp-link";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          aria-label="Jombubox, página de inicio"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          <Brand />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <nav aria-label="Navegación principal" className="hidden items-center gap-2 md:flex">
            <Link
              href="/catalogo"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-small font-semibold text-foreground transition-colors hover:bg-muted hover:text-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Catálogo
            </Link>
            <Link
              href="/contacto"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-small font-semibold text-foreground transition-colors hover:bg-muted hover:text-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Contáctanos
            </Link>
            <Link
              href="/admin"
              aria-label="Gestionar inventario"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-small font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="lg:hidden">Inventario</span>
              <span className="hidden lg:inline">Gestionar inventario</span>
            </Link>
            <span className="hidden lg:inline-flex"><WhatsAppLink>WhatsApp</WhatsAppLink></span>
          </nav>
          <ThemeToggle />
          <PublicMobileMenu />
        </div>
      </div>
    </header>
  );
}
