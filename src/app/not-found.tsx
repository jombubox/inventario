import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted px-5 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center sm:p-10">
        <Brand className="justify-center" />
        <p className="mt-10 text-label uppercase tracking-[0.16em] text-primary">Error 404</p>
        <h1 className="mt-3 text-h1 text-navy">Esta ubicación está vacía.</h1>
        <p className="mt-4 text-body text-muted-foreground">
          La página que buscas no existe o no forma parte del catálogo público.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/catalogo" className={buttonStyles()}>
            Ver catálogo
          </Link>
          <Link href="/" className={buttonStyles({ variant: "outline" })}>
            Volver al inicio
          </Link>
        </div>
      </section>
    </main>
  );
}

