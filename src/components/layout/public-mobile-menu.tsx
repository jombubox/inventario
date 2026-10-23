"use client";

import Link from "next/link";

import { WhatsAppLink } from "@/components/ui/whatsapp-link";

export function PublicMobileMenu() {
  function closeMenu(event: React.MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("a")) {
      event.currentTarget.closest("details")?.removeAttribute("open");
    }
  }

  return (
    <details className="group md:hidden" onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.currentTarget.removeAttribute("open");
        event.currentTarget.querySelector("summary")?.focus();
      }
    }}>
      <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden" aria-label="Menú de navegación">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-6"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </summary>
      <nav aria-label="Navegación móvil" onClick={closeMenu} className="absolute inset-x-0 top-full grid max-h-[calc(100dvh-4.5rem)] gap-2 overflow-y-auto border-b border-border bg-card p-5 shadow-lg">
        <Link href="/catalogo" className="rounded-xl p-3 font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Catálogo</Link>
        <Link href="/contacto" className="rounded-xl p-3 font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Contáctanos</Link>
        <WhatsAppLink className="w-full">WhatsApp</WhatsAppLink>
        <Link href="/admin" className="rounded-xl p-3 text-small text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Gestionar inventario</Link>
      </nav>
    </details>
  );
}
