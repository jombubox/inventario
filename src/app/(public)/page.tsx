import type { Metadata } from "next";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { getDb } from "@/db";
import { ProductCard } from "@/features/catalog/components/product-card";
import {
  getPublicBrands,
  getPublicComponentTypes,
  getPublicProducts,
} from "@/features/catalog/data/public-catalog-queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Refacciones electrónicas con identificación técnica",
  description:
    "Consulta el catálogo público de refacciones y componentes electrónicos JombuBox por SKU, número de parte, marca, tipo o modelo compatible.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "JombuBox · Refacciones electrónicas",
    description: "Catálogo técnico de componentes identificados y existencias verificadas.",
    url: "/",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "JombuBox" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "JombuBox · Refacciones electrónicas",
    description: "Catálogo técnico de componentes identificados y existencias verificadas.",
    images: ["/opengraph-image"],
  },
};

export default async function HomePage() {
  const db = getDb();
  const [catalog, brands, componentTypes] = await Promise.all([
    getPublicProducts(db, { sort: "recientes", page: 1 }, { pageSize: 8 }),
    getPublicBrands(db),
    getPublicComponentTypes(db),
  ]);

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border bg-background">
        <div className="surface-grid pointer-events-none absolute inset-0 -z-10 opacity-60" />
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] lg:items-end lg:px-10 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-label uppercase tracking-[0.16em] text-primary">
              Catálogo técnico JombuBox
            </p>
            <h1 className="mt-4 text-h1 text-navy sm:max-w-2xl">
              Refacciones electrónicas, identificadas con precisión.
            </h1>
            <p className="mt-5 max-w-2xl text-body text-muted-foreground sm:text-lg sm:leading-8">
              Busca por SKU, número de parte, marca, tipo de componente o modelo compatible.
              La disponibilidad publicada refleja únicamente piezas listas para venta.
            </p>
            <form action="/catalogo" method="get" role="search" className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
              <label htmlFor="home-search" className="sr-only">
                Buscar en el catálogo
              </label>
              <input
                id="home-search"
                name="q"
                type="search"
                maxLength={120}
                placeholder="Ej. BN94, UN55NU7100 o tarjeta main"
                className="h-13 min-w-0 flex-1 rounded-xl border border-input bg-card px-4 text-body shadow-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button type="submit" className={buttonStyles({ size: "lg" })}>
                Buscar piezas
                <span aria-hidden="true">→</span>
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-navy/10 bg-navy p-6 text-white shadow-[0_18px_55px_rgba(0,15,48,0.16)] sm:p-7">
            <p className="text-label uppercase tracking-[0.16em] text-accent">Inventario público</p>
            <p className="mt-4 text-4xl font-semibold tracking-[-0.04em]">{catalog.total}</p>
            <p className="mt-2 text-small text-white/70">
              {catalog.total === 1 ? "producto técnico publicado" : "productos técnicos publicados"}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/15 pt-5 text-small">
              <div>
                <p className="font-semibold text-white">{componentTypes.length}</p>
                <p className="mt-1 text-white/60">tipos con producto</p>
              </div>
              <div>
                <p className="font-semibold text-white">{brands.length}</p>
                <p className="mt-1 text-white/60">marcas publicadas</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {(componentTypes.length > 0 || brands.length > 0) ? (
        <section className="border-b border-border bg-card px-5 py-12 sm:px-8 lg:px-10">
          <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-h3 text-navy">Explorar por componente</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {componentTypes.slice(0, 10).map((type) => (
                  <Link
                    key={type.slug}
                    href={`/catalogo?tipo=${type.slug}`}
                    className="rounded-full border border-border bg-background px-3.5 py-2 text-small font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-primary-soft hover:text-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {type.name} <span className="text-muted-foreground">{type.productCount}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-h3 text-navy">Explorar por marca</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {brands.slice(0, 12).map((brand) => (
                  <Link
                    key={brand.slug}
                    href={`/catalogo?marca=${brand.slug}`}
                    className="rounded-full border border-border bg-background px-3.5 py-2 text-small font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-primary-soft hover:text-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {brand.name} <span className="text-muted-foreground">{brand.productCount}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-5 py-14 sm:px-8 sm:py-16 lg:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-label uppercase tracking-[0.15em] text-primary">Actualizaciones</p>
              <h2 className="mt-2 text-h2 text-navy">Productos recientes</h2>
            </div>
            <Link href="/catalogo" className={buttonStyles({ variant: "outline" })}>
              Ver catálogo completo
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          {catalog.products.length > 0 ? (
            <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
              {catalog.products.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          ) : (
            <div className="mt-7 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <h3 className="text-h3 text-navy">Aún no hay productos públicos.</h3>
              <p className="mt-2 text-small text-muted-foreground">
                Los productos aparecerán aquí cuando estén activos y marcados como públicos.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
