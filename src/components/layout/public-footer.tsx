import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { buildWhatsAppUrl, contact, genericContactMessage } from "@/config/contact";

export function PublicFooter() {
  return (
    <footer data-public-footer className="border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <div>
          <Brand className="origin-left scale-90" />
          <p className="mt-2 text-small text-muted-foreground">Catálogo público de inventario técnico.</p>
        </div>
        <nav aria-label="Contacto" className="flex flex-col items-start gap-1 text-small sm:items-end">
          <Link href="/contacto" className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Contáctanos</Link>
          <a href={buildWhatsAppUrl(genericContactMessage)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-wrap items-center gap-x-2 rounded-lg px-2 text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span>WhatsApp</span><span className="whitespace-nowrap">{contact.displayPhone}</span><span className="sr-only"> (abre en otra pestaña)</span>
          </a>
        </nav>
      </div>
    </footer>
  );
}

