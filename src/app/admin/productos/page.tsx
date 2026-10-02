import Link from "next/link";

import { ProductsTable } from "@/features/products/components/products-table";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { AdminQuickAddButton } from "@/features/inventory/components/quick-add-inventory";
import {
  listAdminProducts,
  listProductCatalogOptions,
} from "@/features/products/data/admin-product-queries";

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
  await requireAdmin();
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
      <PageHeader eyebrow="Catálogo interno" title="Productos" description="Busca, filtra y administra la identidad comercial de cada refacción." actions={<AdminQuickAddButton />} />

      <Card><CardContent className="p-4 sm:p-5">
        <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-7" method="get">
          <Input name="q" defaultValue={query.q} placeholder="SKU, título, parte, serie, marca o modelo" className="md:col-span-2" />
          <Select name="brand" defaultValue={query.brand ?? ""}><option value="">Todas las marcas</option>{options.brands.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</Select>
          <Select name="type" defaultValue={query.type ?? ""}><option value="">Todos los tipos</option>{options.componentTypes.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</Select>
          <Select name="status" defaultValue={query.status ?? ""}><option value="">Todos los estados</option><option value="DRAFT">Borrador</option><option value="ACTIVE">Activo</option><option value="ARCHIVED">Archivado</option></Select>
          <Select name="stock" defaultValue={query.stock ?? ""}><option value="">Cualquier stock</option><option value="in-stock">Con stock</option><option value="out-of-stock">Sin stock</option><option value="unlocated">Sin ubicación</option></Select>
          <button className="h-11 rounded-xl bg-brand-navy px-4 text-small font-semibold text-white hover:bg-brand-navy/90">Aplicar filtros</button>
          <div className="flex flex-wrap gap-3 md:col-span-3 xl:col-span-7">
            <Select name="public" defaultValue={query.public === undefined ? "" : String(query.public)} className="max-w-44"><option value="">Público o interno</option><option value="true">Publicado</option><option value="false">No publicado</option></Select>
            <Select name="sort" defaultValue={query.sort} className="max-w-48"><option value="updatedAt">Actualización</option><option value="title">Título</option><option value="sku">SKU</option><option value="createdAt">Creación</option></Select>
            <Select name="direction" defaultValue={query.direction} className="max-w-36"><option value="desc">Descendente</option><option value="asc">Ascendente</option></Select>
            <Select name="pageSize" defaultValue={String(query.pageSize)} className="max-w-32"><option value="20">20 filas</option><option value="50">50 filas</option><option value="100">100 filas</option></Select>
          </div>
        </form>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {rows.length === 0 ? <div className="p-8"><EmptyState title="No se encontraron productos" description="Ajusta los filtros o crea el primer producto de JombuBox." action={<AdminQuickAddButton className="w-auto" />} /></div> : (
          <ProductsTable products={rows} />
        )}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-small text-muted-foreground">{total.toLocaleString("es-MX")} producto(s) · página {query.page} de {pageCount}</p><div className="flex gap-2"><Link aria-disabled={query.page <= 1} href={pageHref(currentParams, Math.max(1, query.page - 1))} className="rounded-lg border border-border px-3 py-2 text-small font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-40">Anterior</Link><Link aria-disabled={query.page >= pageCount} href={pageHref(currentParams, Math.min(pageCount, query.page + 1))} className="rounded-lg border border-border px-3 py-2 text-small font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-40">Siguiente</Link></div></div>
      </CardContent></Card>
    </div>
  );
}
