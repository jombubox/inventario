import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonStyles } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db";
import { ActiveFilters } from "@/features/catalog/components/active-filters";
import { CatalogFilters } from "@/features/catalog/components/catalog-filters";
import { CatalogPagination } from "@/features/catalog/components/catalog-pagination";
import { MobileFilterDialog } from "@/features/catalog/components/mobile-filter-dialog";
import { ProductCard } from "@/features/catalog/components/product-card";
import {
  catalogFilterCount,
  catalogQueryRecord,
  parseCatalogSearchParams,
  type CatalogSearchParams,
} from "@/features/catalog/domain/catalog-query";
import {
  getPublicBrands,
  getPublicComponentTypes,
  getPublicProducts,
} from "@/features/catalog/data/public-catalog-queries";

export const dynamic = "force-dynamic";

type CatalogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: CatalogPageProps): Promise<Metadata> {
  const query = parseCatalogSearchParams(await searchParams);
  const filtered = Object.keys(catalogQueryRecord(query)).length > 0;
  const title = query.q ? `Resultados para “${query.q}”` : "Catálogo de refacciones";

  return {
    title,
    description:
      "Busca y filtra refacciones electrónicas por marca, componente, modelo, condición, disponibilidad y precio.",
    alternates: { canonical: "/catalogo" },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: `${title} | JombuBox`,
      description: "Catálogo técnico público de JombuBox.",
      url: "/catalogo",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Catálogo JombuBox" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | JombuBox`,
      description: "Catálogo técnico público de JombuBox.",
      images: ["/opengraph-image"],
    },
  };
}

function PreservedInputs({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

function CatalogLoadingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 lg:px-10" aria-label="Cargando catálogo">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-4 h-12 max-w-3xl" />
      <div className="mt-10 grid gap-8 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <Skeleton className="hidden h-[34rem] rounded-2xl lg:block" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-[27rem] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const query = parseCatalogSearchParams(await searchParams);
  return (
    <Suspense key={JSON.stringify(query)} fallback={<CatalogLoadingSkeleton />}>
      <CatalogContent query={query} />
    </Suspense>
  );
}

async function CatalogContent({ query }: { query: CatalogSearchParams }) {
  const db = getDb();
  const [catalog, brands, componentTypes] = await Promise.all([
    getPublicProducts(db, query),
    getPublicBrands(db),
    getPublicComponentTypes(db),
  ]);
  const filterCount = catalogFilterCount(query);
  const searchContext = catalogQueryRecord(query, { q: undefined, page: 1 });
  const sortContext = catalogQueryRecord(query, { sort: undefined, page: 1 });

  return (
    <div className="bg-background">
      <section className="border-b border-border bg-card px-5 py-10 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <p className="text-label uppercase tracking-[0.16em] text-primary">Inventario público</p>
          <h1 className="mt-2 text-h1 text-navy">Catálogo técnico</h1>
          <p className="mt-3 max-w-2xl text-body text-muted-foreground">
            Identifica piezas por sus datos técnicos y consulta su estado de disponibilidad sin exponer ubicaciones internas.
          </p>
          <form action="/catalogo" method="get" role="search" className="mt-6 flex max-w-3xl flex-col gap-3 sm:flex-row">
            <PreservedInputs values={searchContext} />
            <label htmlFor="catalog-search" className="sr-only">
              Buscar productos
            </label>
            <input
              id="catalog-search"
              type="search"
              name="q"
              defaultValue={query.q ?? ""}
              maxLength={120}
              placeholder="SKU, número de parte, marca, tipo o modelo"
              className="h-12 min-w-0 flex-1 rounded-xl border border-input bg-background px-4 outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button type="submit" className={buttonStyles()}>
              Buscar
            </button>
          </form>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-small text-muted-foreground" aria-live="polite">
            <strong className="text-foreground">{catalog.total}</strong>{" "}
            {catalog.total === 1 ? "producto encontrado" : "productos encontrados"}
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <MobileFilterDialog activeCount={filterCount}>
              <CatalogFilters
                query={query}
                brands={brands}
                componentTypes={componentTypes}
                idPrefix="mobile"
              />
            </MobileFilterDialog>
            <form action="/catalogo" method="get" className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <PreservedInputs values={sortContext} />
              <label htmlFor="catalog-sort" className="sr-only">
                Ordenar catálogo
              </label>
              <select
                id="catalog-sort"
                name="sort"
                defaultValue={query.sort}
                className="h-11 min-w-0 max-w-full rounded-xl border border-input bg-card px-3 text-small outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="recientes">Más recientes</option>
                <option value="nombre-asc">Nombre A–Z</option>
                <option value="nombre-desc">Nombre Z–A</option>
                <option value="precio-asc">Precio menor a mayor</option>
                <option value="precio-desc">Precio mayor a menor</option>
              </select>
              <button type="submit" className={buttonStyles({ variant: "outline", size: "sm" })}>
                Ordenar
              </button>
            </form>
          </div>
        </div>

        <div className="mt-5">
          <ActiveFilters query={query} brands={brands} componentTypes={componentTypes} />
        </div>

        <div className="mt-7 grid gap-8 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
          <aside className="hidden lg:block" aria-label="Filtros del catálogo">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-h3 text-navy">Filtros</h2>
              <div className="mt-5">
                <CatalogFilters
                  query={query}
                  brands={brands}
                  componentTypes={componentTypes}
                  idPrefix="desktop"
                />
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            {catalog.products.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {catalog.products.map((product) => (
                  <ProductCard key={product.slug} product={product} />
                ))}
              </div>
            ) : (
              <section className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
                <h2 className="text-h2 text-navy">No encontramos coincidencias.</h2>
                <p className="mx-auto mt-3 max-w-lg text-body text-muted-foreground">
                  Revisa el SKU o elimina algunos filtros. Solo se muestran productos públicos y activos.
                </p>
                <Link href="/catalogo" className={buttonStyles({ variant: "outline", className: "mt-6" })}>
                  Ver todo el catálogo
                </Link>
              </section>
            )}
            <CatalogPagination query={query} pageCount={catalog.pageCount} />
          </div>
        </div>
      </div>
    </div>
  );
}
