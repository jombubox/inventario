"use client";

import { Button } from "@/components/ui/button";

export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto grid min-h-[60dvh] w-full max-w-2xl place-items-center px-5 py-16 text-center">
      <div className="rounded-2xl border border-border bg-card p-8 sm:p-10">
        <p className="text-label uppercase tracking-[0.16em] text-danger">Catálogo no disponible</p>
        <h1 className="mt-3 text-h1 text-navy">No pudimos cargar esta información.</h1>
        <p className="mt-4 text-body text-muted-foreground">
          Puede ser una interrupción temporal. Intenta nuevamente para consultar datos actualizados.
        </p>
        <Button onClick={reset} className="mt-7">
          Intentar de nuevo
        </Button>
      </div>
    </section>
  );
}

