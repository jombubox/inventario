import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getDb } from "@/db";
import { hasPermission } from "@/features/auth/domain/permissions";
import { requirePagePermission } from "@/features/auth/server/authorization";
import {
  listAdminProducts,
  listProductCatalogOptions,
} from "@/features/products/data/admin-product-queries";
import { formatDateTime } from "@/lib/format";
import { productListQuerySchema } from "@/validators/admin-query";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValues(searchParams: SearchParams) {
  return Object.fromEntries(
    Object.entries(searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
}

function pageHref(current: URLSearchParams, page: number): string {
  const next = new URLSearchParams(current);
  next.set("page", String(page));
  return `/admin/productos?${next.toString()}`;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePagePermission("PRODUCT_READ");
  const rawParams = firstValues(await searchParams);
  const query = productListQuerySchema.parse(rawParams);
  const db = getDb();
  const [{ rows, total, pageCount }, options] = await Promise.all([
    listAdminProducts(db, query),
    listProductCatalogOptions(db),
  ]);
  const currentParams = new URLSearchParams(
    Object.entries(rawParams).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <PageHeader eyebrow="Catálogo interno" title="Productos" description="Busca, filtra y administra la identidad comercial de cada refacción." actions={hasPermission(user.role, "PRODUCT_CREATE") ? <Link href="/admin/productos/nuevo" className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-small font-semibold text-white hover:bg-primary-hover">Nuevo producto</Link> : undefined} />

      <Card><CardContent className="p-4 sm:p-5">
        <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-7" method="get">
          <Input name="q" defaultValue={query.q} placeholder="SKU, título, parte, marca o modelo" className="md:col-span-2" />
          <Select name="brand" defaultValue={query.brand ?? ""}><option value="">Todas las marcas</option>{options.brands.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</Select>
          <Select name="type" defaultValue={query.type ?? ""}><option value="">Todos los tipos</option>{options.componentTypes.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</Select>
          <Select name="status" defaultValue={query.status ?? ""}><option value="">Todos los estados</option><option value="DRAFT">Borrador</option><option value="ACTIVE">Activo</option><option value="ARCHIVED">Archivado</option></Select>
          <Select name="stock" defaultValue={query.stock ?? ""}><option value="">Cualquier stock</option><option value="in-stock">Con stock</option><option value="out-of-stock">Sin stock</option><option value="unlocated">Sin ubicación</option></Select>
          <button className="h-11 rounded-xl bg-navy px-4 text-small font-semibold text-white hover:bg-navy/90">Aplicar filtros</button>
          <div className="flex gap-3 md:col-span-3 xl:col-span-7">
            <Select name="public" defaultValue={query.public === undefined ? "" : String(query.public)} className="max-w-44"><option value="">Público o interno</option><option value="true">Publicado</option><option value="false">No publicado</option></Select>
            <Select name="sort" defaultValue={query.sort} className="max-w-48"><option value="updatedAt">Actualización</option><option value="title">Título</option><option value="sku">SKU</option><option value="createdAt">Creación</option></Select>
            <Select name="direction" defaultValue={query.direction} className="max-w-36"><option value="desc">Descendente</option><option value="asc">Ascendente</option></Select>
            <Select name="pageSize" defaultValue={String(query.pageSize)} className="max-w-32"><option value="20">20 filas</option><option value="50">50 filas</option><option value="100">100 filas</option></Select>
          </div>
        </form>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {rows.length === 0 ? <div className="p-8"><EmptyState title="No se encontraron productos" description="Ajusta los filtros o crea el primer producto de JombuBox." action={<Link href="/admin/productos/nuevo" className="font-semibold text-primary">Crear producto</Link>} /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] text-left text-small">
              <thead className="border-b border-border bg-muted/60 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Imagen</th><th className="px-4 py-3 font-medium">SKU / Producto</th><th className="px-4 py-3 font-medium">Marca</th><th className="px-4 py-3 font-medium">Tipo / Parte</th><th className="px-4 py-3 text-right font-medium">Stock</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-4 py-3 font-medium">Actualizado</th><th className="px-4 py-3 text-right font-medium">Acción</th></tr></thead>
              <tbody className="divide-y divide-border">{rows.map((product) => <tr key={product.id} className="hover:bg-muted/35"><td className="px-4 py-3"><div className="grid size-10 place-items-center rounded-lg bg-navy-soft text-xs font-bold text-navy" title={product.primaryImage ?? "Sin imagen"}>JB</div></td><td className="max-w-sm px-4 py-3"><p className="font-mono text-xs font-semibold text-primary">{product.sku}</p><p className="mt-1 truncate font-semibold text-navy">{product.title}</p></td><td className="px-4 py-3">{product.brand}</td><td className="px-4 py-3"><p>{product.componentType}</p><p className="text-muted-foreground">{product.partNumber ?? "Sin número"}</p></td><td className="px-4 py-3 text-right"><p className="font-semibold text-navy">{product.physicalStock}</p><p className="text-muted-foreground">{product.availableStock} disp.</p></td><td className="px-4 py-3"><div className="flex flex-col items-start gap-1"><Badge variant={product.status === "ACTIVE" ? "success" : "neutral"}>{product.status}</Badge>{product.isPublic ? <span className="text-xs text-success">Público</span> : <span className="text-xs text-muted-foreground">Interno</span>}</div></td><td className="px-4 py-3 text-muted-foreground">{formatDateTime(product.updatedAt)}</td><td className="px-4 py-3 text-right"><Link href={`/admin/productos/${product.id}`} className="font-semibold text-primary hover:underline">Editar</Link></td></tr>)}</tbody>
            </table>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-small text-muted-foreground">{total.toLocaleString("es-MX")} producto(s) · página {query.page} de {pageCount}</p><div className="flex gap-2"><Link aria-disabled={query.page <= 1} href={pageHref(currentParams, Math.max(1, query.page - 1))} className="rounded-lg border border-border px-3 py-2 text-small font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-40">Anterior</Link><Link aria-disabled={query.page >= pageCount} href={pageHref(currentParams, Math.min(pageCount, query.page + 1))} className="rounded-lg border border-border px-3 py-2 text-small font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-40">Siguiente</Link></div></div>
      </CardContent></Card>
    </div>
  );
}
