import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { ProductImageManager } from "@/features/images/components/product-image-manager";
import { ArchiveProductForm } from "@/features/products/components/archive-product-form";
import { ProductForm } from "@/features/products/components/product-form";
import { getAdminProductDetail, listProductCatalogOptions } from "@/features/products/data/admin-product-queries";
import { formatProductStatus } from "@/lib/format";
import { productPublicationPath } from "@/features/products/domain/public-product";

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const db = getDb();
  const [product, options, query] = await Promise.all([getAdminProductDetail(db, id), listProductCatalogOptions(db), searchParams]);
  if (!product) notFound();
  const publicationPath = productPublicationPath(product);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader eyebrow="Detalle de producto" title={product.title} description={product.sku} actions={<div className="flex flex-wrap items-center gap-2"><Badge variant={product.status === "ACTIVE" ? "success" : "neutral"}>{formatProductStatus(product.status)}</Badge>{publicationPath ? <a href={publicationPath} target="_blank" rel="noopener noreferrer" className="rounded-md bg-card px-3 py-2 text-small font-semibold text-link shadow-sm">Ver publicación</a> : null}<Link href="/admin/productos" className="rounded-md bg-card px-3 py-2 text-small font-semibold shadow-sm">Volver</Link></div>} />
      {query.notice ? <p role="status" className="rounded-xl border border-success/25 bg-success/5 px-4 py-3 text-small text-success">{query.notice === "created" ? "Producto creado correctamente." : "Producto actualizado correctamente."}</p> : null}
      <section className="grid gap-3 sm:grid-cols-4" aria-label="Resumen de inventario"><Card><CardContent className="p-4"><p className="text-small text-muted-foreground">Stock físico</p><p className="mt-1 text-2xl font-semibold text-navy">{product.summary.physicalStock}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-small text-muted-foreground">Disponible</p><p className="mt-1 text-2xl font-semibold text-navy">{product.summary.availableStock}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-small text-muted-foreground">Registros</p><p className="mt-1 text-2xl font-semibold text-navy">{product.summary.inventoryItemCount}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-small text-muted-foreground">Ubicaciones</p><p className="mt-1 text-2xl font-semibold text-navy">{product.summary.locationCount}</p></CardContent></Card></section>
      <ProductForm brands={options.brands} componentTypes={options.componentTypes} product={{ id: product.id, sku: product.sku, brandId: product.brandId, componentTypeId: product.componentTypeId, partNumber: product.partNumber, primarySerialNumber: product.serialNumbers.find((item) => item.kind === "PRIMARY")?.serialNumber ?? null, secondarySerialNumbers: product.serialNumbers.filter((item) => item.kind === "SECONDARY").map((item) => item.serialNumber), title: product.title, description: product.description, salePrice: product.salePrice, currency: product.currency, status: product.status, isPublic: product.isPublic, updatedAt: product.updatedAt.toISOString(), compatibilities: product.compatibilities.map((item) => ({ brandId: item.brandId, model: item.model, notes: item.notes })) }} />
      <ProductImageManager key={product.id} productId={product.id} canManage images={product.images.map((image) => ({ id: image.id, url: image.url, alt: image.alt, isPrimary: image.isPrimary, sortOrder: image.sortOrder }))} />
      <div className="flex flex-col gap-4 rounded-md bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-navy">Inventario físico</p><p className="text-small text-muted-foreground">Consulta o agrega existencias vinculadas a este SKU.</p></div><Link href={`/admin/inventario?q=${encodeURIComponent(product.sku)}`} className="font-semibold text-link hover:underline">Ver inventario</Link></div>
      {product.status !== "ARCHIVED" ? <ArchiveProductForm id={product.id} updatedAt={product.updatedAt.toISOString()} /> : null}
    </div>
  );
}
