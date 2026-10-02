"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ProductImagePlaceholder } from "@/features/catalog/components/product-image";
import { ImagePreview, PreviewPhoto } from "@/features/images/components/image-preview";
import type { getAdminProductReview, listAdminProducts } from "@/features/products/data/admin-product-queries";
import { productPublicationPath } from "@/features/products/domain/public-product";
import { formatDateTime, formatMoney, formatProductStatus } from "@/lib/format";

type ProductRow = Awaited<ReturnType<typeof listAdminProducts>>["rows"][number];
type Review = NonNullable<Awaited<ReturnType<typeof getAdminProductReview>>>;
type Selection = { product: ProductRow; kind: "images" | "models" | "details" };

function ProductReviewModal({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const { product, kind } = selection;
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (kind === "details") return;
    const controller = new AbortController();
    fetch(`/api/admin/products/${product.id}/review`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as Review & { error?: string };
        if (!response.ok) throw new Error(body.error || "No fue posible cargar el producto.");
        setReview(body as Review);
      }).catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "No fue posible cargar el producto."); });
    return () => controller.abort();
  }, [product.id, kind, attempt]);
  const publicationPath = productPublicationPath(product);
  const groups = new Map<string, string[]>();
  for (const item of review?.compatibilities ?? []) groups.set(item.brand, [...(groups.get(item.brand) ?? []), item.model]);
  return <Modal title={kind === "images" ? "Fotos del producto" : kind === "models" ? "Modelos compatibles" : "Detalles del producto"} onClose={onClose}>
    <p className="mb-4 break-words font-semibold">{product.title}</p>
    {kind === "details" ? <>
      <dl className="grid gap-4 text-small sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Creado</dt><dd>{formatDateTime(product.createdAt)}</dd></div>
        <div><dt className="text-muted-foreground">Última actualización</dt><dd>{formatDateTime(product.updatedAt)}</dd></div>
        <div><dt className="text-muted-foreground">Estado</dt><dd>{formatProductStatus(product.status)}</dd></div>
        <div><dt className="text-muted-foreground">Catálogo público</dt><dd>{publicationPath ? "Visible" : "No visible"}</dd></div>
        <div><dt className="text-muted-foreground">SKU</dt><dd className="break-all font-mono">{product.sku}</dd></div>
        <div><dt className="text-muted-foreground">Marca / Tipo de pieza</dt><dd>{product.brand} · {product.componentType}</dd></div>
        <div><dt className="text-muted-foreground">Número de parte</dt><dd>{product.partNumber ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">Existencias</dt><dd>{product.physicalStock} piezas · {product.availableStock} disponibles</dd></div>
      </dl>
      {publicationPath ? <a href={publicationPath} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary hover:underline">Ver publicación</a> : null}
    </> : error ? <div role="alert"><p className="text-danger">{error}</p><Button type="button" variant="outline" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Reintentar</Button></div>
      : !review ? <p role="status">Cargando…</p>
      : kind === "images" ? <ImagePreview images={review.images} title={product.title} />
      : groups.size === 0 ? <p>Este producto no tiene modelos compatibles registrados.</p>
      : <div className="space-y-5">{Array.from(groups, ([brand, models]) => <section key={brand}><h3 className="font-semibold">{brand}</h3><ul className="mt-2 list-disc space-y-2 pl-5">{models.map((model) => <li key={model} className="break-words">{model}</li>)}</ul></section>)}</div>}
  </Modal>;
}

export function ProductsTable({ products }: { products: ProductRow[] }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const actionClass = "min-h-11 text-small font-semibold text-primary hover:underline";
  const secondary = "hidden px-3 py-3 xl:table-cell";
  return <>
    <div className="max-w-full overflow-x-auto">
      <table className="products-table w-full text-left text-small">
        <thead className="border-b border-border bg-muted/60 text-muted-foreground"><tr>
          <th className="px-3 py-3 font-medium">Imagen</th><th className="px-3 py-3 font-medium">Producto</th>
          <th className={secondary}>SKU</th><th className={secondary}>Marca</th><th className={secondary}>Tipo de pieza / Parte</th>
          <th className="px-3 py-3 font-medium">Precio</th><th className={secondary}>Modelos</th>
          <th className={secondary}>Existencias</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 font-medium">Acciones</th>
        </tr></thead>
        <tbody className="divide-y divide-border">{products.map((product) => <tr key={product.id} className="hover:bg-muted/35">
          <td className="px-3 py-3">{product.primaryImage ? <button type="button" aria-label={`Ver fotos de ${product.title}`} onClick={() => setSelection({ product, kind: "images" })} className="relative block size-12 overflow-hidden rounded-md border border-border bg-white focus-visible:ring-2 focus-visible:ring-ring"><PreviewPhoto image={{ url: product.primaryImage, alt: product.title }} sizes="48px" className="p-1" /></button> : <ProductImagePlaceholder className="size-12 rounded-md [&_svg]:size-8" />}</td>
          <td className="max-w-64 break-words px-3 py-3 font-semibold text-navy">{product.title}<button type="button" onClick={() => setSelection({ product, kind: "models" })} className={`${actionClass} mt-1 block text-left text-xs xl:hidden`}>Ver compatibilidad ({product.compatibilityCount})</button></td>
          <td className={`${secondary} font-mono text-xs`}>{product.sku}</td><td className={secondary}>{product.brand}</td>
          <td className={secondary}>{product.componentType}<p className="text-muted-foreground">{product.partNumber ?? "Sin número"}</p></td>
          <td className="whitespace-nowrap px-3 py-3 font-semibold">{product.salePrice === null ? "—" : <>{formatMoney(product.salePrice, product.currency)}<span className="block text-xs font-normal text-muted-foreground">{product.currency}</span></>}</td>
          <td className={secondary}><button type="button" onClick={() => setSelection({ product, kind: "models" })} className={actionClass}>Ver compatibilidad ({product.compatibilityCount})</button></td>
          <td className={secondary}>{product.physicalStock}<p className="text-xs text-muted-foreground">{product.availableStock} disp.</p></td>
          <td className="px-3 py-3"><Badge variant={product.status === "ACTIVE" ? "success" : "neutral"}>{formatProductStatus(product.status)}</Badge></td>
          <td className="px-3 py-3"><div className="flex flex-col items-start"><Link href={`/admin/productos/${product.id}`} className={`${actionClass} inline-flex items-center`}>Editar</Link><button type="button" onClick={() => setSelection({ product, kind: "details" })} className={actionClass}>Detalles</button></div></td>
        </tr>)}</tbody>
      </table>
    </div>
    {selection ? <ProductReviewModal key={`${selection.product.id}-${selection.kind}`} selection={selection} onClose={() => setSelection(null)} /> : null}
  </>;
}
