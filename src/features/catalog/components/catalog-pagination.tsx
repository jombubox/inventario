import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import {
  catalogQueryRecord,
  type CatalogSearchParams,
} from "@/features/catalog/domain/catalog-query";

function pageHref(query: CatalogSearchParams, page: number): string {
  const params = new URLSearchParams(catalogQueryRecord(query, { page }));
  return params.size ? `/catalogo?${params.toString()}` : "/catalogo";
}

export function CatalogPagination({
  query,
  pageCount,
}: {
  query: CatalogSearchParams;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const current = Math.min(query.page, pageCount);

  return (
    <nav className="mt-10 flex items-center justify-between gap-4 border-t border-border pt-6" aria-label="Paginación del catálogo">
      {current > 1 ? (
        <Link href={pageHref(query, current - 1)} className={buttonStyles({ variant: "outline" })}>
          ← Anterior
        </Link>
      ) : (
        <span />
      )}
      <p className="text-small text-muted-foreground" aria-live="polite">
        Página {current} de {pageCount}
      </p>
      {current < pageCount ? (
        <Link href={pageHref(query, current + 1)} className={buttonStyles({ variant: "outline" })}>
          Siguiente →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

