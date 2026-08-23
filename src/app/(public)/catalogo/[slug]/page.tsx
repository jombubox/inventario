import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AvailabilityBadge } from "@/features/catalog/components/availability-badge";
import { ProductCard } from "@/features/catalog/components/product-card";
import { ProductGallery } from "@/features/catalog/components/product-gallery";
import {
  loadPublicProductBySlug,
  loadRelatedProducts,
} from "@/features/catalog/data/public-catalog-loaders";
import {
  conditionLabels,
  formatPublicPrice,
} from "@/features/catalog/domain/catalog";
import {
  buildBreadcrumbJsonLd,
  buildProductJsonLd,
  serializeJsonLd,
} from "@/features/catalog/seo/product-json-ld";
import { absoluteSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

type ProductPageProps = { params: Promise<{ slug: string }> };

async function RelatedProductsSection({ slug }: { slug: string }) {
  const related = await loadRelatedProducts(slug);
  if (related.length === 0) return null;

  return (
    <section className="mt-14 border-t border-border pt-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-label uppercase tracking-[0.14em] text-primary">Misma familia técnica</p>
          <h2 className="mt-2 text-h2 text-navy">Productos relacionados</h2>
        </div>
        <Link href="/catalogo" className={buttonStyles({ variant: "outline", size: "sm" })}>
          Ver catálogo
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {related.map((item) => <ProductCard key={item.slug} product={item} />)}
      </div>
    </section>
  );
}

function RelatedProductsSkeleton() {
  return (
    <section className="mt-14 border-t border-border pt-10" aria-label="Cargando productos relacionados">
      <Skeleton className="h-9 w-64" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[27rem] rounded-2xl" />
        ))}
      </div>
    </section>
  );
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadPublicProductBySlug(slug);
  if (!product) notFound();

  const description =
    product.description?.slice(0, 155) ??
    `${product.componentType.name} ${product.brand.name}${product.partNumber ? ` ${product.partNumber}` : ""}. Consulta disponibilidad en JombuBox.`;
  const fallbackImage = absoluteSiteUrl("/opengraph-image") ?? "/opengraph-image";
  const socialImage = product.primaryImage
    ? { url: product.primaryImage.url, alt: product.primaryImage.alt }
    : { url: fallbackImage, alt: "JombuBox", width: 1200, height: 630 };

  return {
    title: product.title,
    description,
    alternates: { canonical: `/catalogo/${product.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      title: `${product.title} | JombuBox`,
      description,
      url: `/catalogo/${product.slug}`,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.title} | JombuBox`,
      description,
      images: [socialImage.url],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await loadPublicProductBySlug(slug);
  if (!product) notFound();

  const productUrl = absoluteSiteUrl(`/catalogo/${product.slug}`);
  const productJsonLd = buildProductJsonLd(product, productUrl);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    product,
    absoluteSiteUrl("/"),
    absoluteSiteUrl("/catalogo"),
    productUrl,
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />

      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        <nav aria-label="Migas de pan" className="mb-7 flex flex-wrap items-center gap-2 text-small text-muted-foreground">
          <Link href="/" className="hover:text-foreground hover:underline">Inicio</Link>
          <span aria-hidden="true">/</span>
          <Link href="/catalogo" className="hover:text-foreground hover:underline">Catálogo</Link>
          <span aria-hidden="true">/</span>
          <span className="line-clamp-1 text-foreground" aria-current="page">{product.title}</span>
        </nav>

        <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:gap-12">
          <ProductGallery images={product.images} title={product.title} />

          <section className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{product.componentType.name}</Badge>
              <AvailabilityBadge availability={product.availability} />
            </div>
            <h1 className="mt-5 text-h1 text-navy">{product.title}</h1>
            <p className="mt-4 text-body text-muted-foreground">
              {product.brand.name}
              {product.partNumber ? ` · Número de parte ${product.partNumber}` : ""}
            </p>

            <dl className="mt-7 grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-5">
              <div>
                <dt className="text-label uppercase tracking-wide text-muted-foreground">SKU JombuBox</dt>
                <dd className="mt-1 break-all font-mono text-sm font-semibold text-navy">{product.sku}</dd>
              </div>
              <div>
                <dt className="text-label uppercase tracking-wide text-muted-foreground">Precio</dt>
                <dd className="mt-1 text-lg font-semibold text-navy">
                  {formatPublicPrice(product.salePrice, product.currency)}
                </dd>
              </div>
            </dl>

            <div className="mt-6">
              <h2 className="text-label uppercase tracking-wide text-muted-foreground">Condiciones disponibles</h2>
              {product.conditions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.conditions.map((condition) => (
                    <Badge key={condition} variant="primary">{conditionLabels[condition]}</Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-small text-muted-foreground">Sin piezas disponibles en este momento.</p>
              )}
            </div>

            <div className="mt-7 rounded-2xl bg-navy p-5 text-white sm:p-6">
              <p className="text-label uppercase tracking-[0.14em] text-accent">Referencia para consulta</p>
              <p className="mt-3 text-lg font-semibold">Conserva el SKU {product.sku}</p>
              <p className="mt-2 text-small text-white/70">
                El canal de contacto todavía no está configurado. El SKU identifica esta pieza sin ambigüedad.
              </p>
            </div>
          </section>
        </div>

        <div className="mt-12 grid gap-8 border-t border-border pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)]">
          <section>
            <h2 className="text-h2 text-navy">Descripción</h2>
            <p className="mt-4 whitespace-pre-wrap text-body text-muted-foreground">
              {product.description?.trim() || "No hay una descripción pública adicional para este producto."}
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-h3 text-navy">Compatibilidad declarada</h2>
            {product.compatibilities.length > 0 ? (
              <ul className="mt-4 divide-y divide-border">
                {product.compatibilities.map((compatibility) => (
                  <li key={`${compatibility.brand}-${compatibility.model}`} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-semibold text-foreground">{compatibility.brand}</p>
                    <p className="mt-1 text-small text-muted-foreground">{compatibility.model}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-small text-muted-foreground">No hay modelos compatibles publicados.</p>
            )}
            <p className="mt-5 rounded-xl bg-warning/10 p-3 text-small text-warning">
              Verifica número de parte, conectores y revisión de la tarjeta antes de adquirirla. Un modelo compatible no garantiza todas sus variantes.
            </p>
          </section>
        </div>

        <Suspense fallback={<RelatedProductsSkeleton />}>
          <RelatedProductsSection slug={product.slug} />
        </Suspense>
      </div>
    </>
  );
}
