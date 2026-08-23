"use client";

import { Button } from "@/components/ui/button";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="es">
      <body>
        <main className="grid min-h-dvh place-items-center bg-background px-5 py-12">
          <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-label uppercase tracking-[0.16em] text-danger">Error inesperado</p>
            <h1 className="mt-3 text-h1 text-navy">JombuBox no pudo completar esta acción.</h1>
            <p className="mt-4 text-body text-muted-foreground">
              Intenta nuevamente. Si el problema continúa, vuelve al inicio y repite la operación.
            </p>
            <Button className="mt-7" onClick={reset}>
              Intentar de nuevo
            </Button>
          </section>
        </main>
      </body>
    </html>
  );
}
