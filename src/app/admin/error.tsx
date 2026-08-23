"use client";

import Link from "next/link";
import { useEffect } from "react";

import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin route failed", { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center">
      <Card className="w-full">
        <CardContent className="p-8 text-center sm:p-12">
          <p className="text-label uppercase tracking-[0.14em] text-danger">Operación interrumpida</p>
          <h1 className="mt-3 text-h2 text-navy">No pudimos cargar esta sección.</h1>
          <p className="mx-auto mt-4 max-w-lg text-body text-muted-foreground">
            El incidente quedó identificado. Intenta nuevamente o vuelve al dashboard.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={reset} className={buttonStyles()}>
              Reintentar
            </button>
            <Link href="/admin" className={buttonStyles({ variant: "outline" })}>
              Ir al dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
