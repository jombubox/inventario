import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";

export function ProductNotFoundContent() {
  return (
    <section className="mx-auto grid min-h-[62dvh] w-full max-w-2xl place-items-center px-5 py-16 text-center">
      <div className="rounded-2xl border border-border bg-card p-8 sm:p-10">
        <p className="text-label uppercase tracking-[0.16em] text-primary">Producto no encontrado</p>
        <h1 className="mt-3 text-h1 text-navy">Esta pieza no está disponible públicamente.</h1>
        <p className="mt-4 text-body text-muted-foreground">
          El enlace puede haber cambiado o el producto no forma parte del catálogo público.
        </p>
        <Link href="/catalogo" className={buttonStyles({ className: "mt-7" })}>
          Volver al catálogo
        </Link>
      </div>
    </section>
  );
}

