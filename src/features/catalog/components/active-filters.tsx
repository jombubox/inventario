import Link from "next/link";

import { conditionLabels } from "@/features/catalog/domain/catalog";
import {
  catalogQueryRecord,
  type CatalogSearchParams,
} from "@/features/catalog/domain/catalog-query";
import type { PublicCatalogOptionDTO } from "@/features/catalog/data/public-catalog-queries";

type ActiveFiltersProps = {
  query: CatalogSearchParams;
  brands: PublicCatalogOptionDTO[];
  componentTypes: PublicCatalogOptionDTO[];
};

const availabilityLabels = {
  disponible: "Disponible",
  pocas: "Pocas piezas",
  agotado: "Agotado",
} as const;

export function ActiveFilters({ query, brands, componentTypes }: ActiveFiltersProps) {
  const labels: Array<{ key: keyof CatalogSearchParams; label: string }> = [];
  if (query.q) labels.push({ key: "q", label: `Búsqueda: ${query.q}` });
  if (query.marca) {
    labels.push({
      key: "marca",
      label: brands.find(({ slug }) => slug === query.marca)?.name ?? query.marca,
    });
  }
  if (query.tipo) {
    labels.push({
      key: "tipo",
      label: componentTypes.find(({ slug }) => slug === query.tipo)?.name ?? query.tipo,
    });
  }
  if (query.modelo) labels.push({ key: "modelo", label: `Modelo: ${query.modelo}` });
  if (query.condicion) {
    labels.push({ key: "condicion", label: conditionLabels[query.condicion] });
  }
  if (query.disponibilidad) {
    labels.push({
      key: "disponibilidad",
      label: availabilityLabels[query.disponibilidad],
    });
  }
  if (query.precioMin !== undefined) {
    labels.push({ key: "precioMin", label: `Desde $${query.precioMin}` });
  }
  if (query.precioMax !== undefined) {
    labels.push({ key: "precioMax", label: `Hasta $${query.precioMax}` });
  }

  if (labels.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtros activos">
      {labels.map(({ key, label }) => {
        const params = new URLSearchParams(catalogQueryRecord(query, { [key]: undefined, page: 1 }));
        const href = params.size ? `/catalogo?${params.toString()}` : "/catalogo";
        return (
          <Link
            key={key}
            href={href}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3 text-small font-semibold text-primary-active hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Quitar filtro ${label}`}
          >
            {label} <span aria-hidden="true">×</span>
          </Link>
        );
      })}
      <Link
        href="/catalogo"
        className="rounded-lg px-2 py-1.5 text-small font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Limpiar todo
      </Link>
    </div>
  );
}

