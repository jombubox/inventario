import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { buttonStyles } from "@/components/ui/button";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { archiveCategories, archiveQuerySchema } from "@/features/archives/domain/archives";
import { getArchiveCounts, listArchivedRecords } from "@/features/archives/data/archive-queries";
import { ArchiveRecordForm } from "@/features/archives/components/archive-record-form";

export default async function ArchivesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const query = archiveQuerySchema.parse(await searchParams);
  const category = archiveCategories.find((item) => item.key === query.categoria)!;
  const db = getDb();
  const [counts, result] = await Promise.all([getArchiveCounts(db), listArchivedRecords(db, query.categoria, query.q, query.page)]);
  const pageLink = (page: number) => `/admin/archivados?${new URLSearchParams({ categoria: query.categoria, q: query.q, page: String(page) })}`;
  return <div className="mx-auto min-w-0 max-w-6xl space-y-6">
    <PageHeader title="Archivados" description="Consulta y restaura los registros archivados." />
    <nav aria-label="Categorías de archivados" className="flex flex-wrap gap-2">
      {archiveCategories.map((item) => <Link key={item.key} href={`/admin/archivados?categoria=${item.key}`} aria-current={item.key === query.categoria ? "page" : undefined} className={buttonStyles({ variant: item.key === query.categoria ? "primary" : "outline", size: "sm" })}>{item.label} ({counts[item.key]})</Link>)}
    </nav>
    <section className="min-w-0 rounded-md bg-card p-4 shadow-sm sm:p-6" aria-labelledby="archive-heading">
      <h2 id="archive-heading" className="text-h3 text-navy">{category.label} {query.categoria === "marcas" || query.categoria === "ubicaciones" || query.categoria === "cajas" ? "archivadas" : "archivados"}</h2>
      {query.categoria === "productos" ? <p className="mt-2 text-small text-muted-foreground">Los productos se restauran como borradores privados. Publicarlos requiere una acción explícita.</p> : null}
      <form method="get" className="my-5 flex flex-wrap items-end gap-3" role="search">
        <input type="hidden" name="categoria" value={query.categoria} />
        <div className="min-w-0 flex-1"><label htmlFor="archive-search" className="text-small font-semibold">Buscar en {category.label.toLocaleLowerCase("es")}</label><Input id="archive-search" type="search" name="q" defaultValue={query.q} maxLength={100} className="mt-2" placeholder={query.categoria === "productos" ? "Nombre, SKU, número de parte o marca" : "Nombre o código"} /></div>
        <button className={buttonStyles()} type="submit">Buscar</button>
      </form>
      <p role="status" className="mb-3 text-small text-muted-foreground">{result.total} registro(s)</p>
      {result.rows.length === 0 ? <p className="py-8 text-center text-muted-foreground">{query.q ? "No se encontraron registros archivados con esta búsqueda." : category.empty}</p> : <div className="overflow-x-auto">
        <table className="w-full text-left text-small"><thead><tr className="border-b border-border"><th className="p-3">Nombre</th><th className="p-3">{query.categoria === "productos" ? "SKU" : "Código"}</th><th className="p-3">{query.categoria === "productos" ? "Marca · Número de parte" : "Relaciones"}</th><th className="p-3">Acciones</th></tr></thead>
          <tbody>{result.rows.map((row) => <tr key={row.id} className="border-b border-border/50 last:border-0"><td className="min-w-44 p-3 font-semibold text-navy">{row.name}</td><td className="p-3 font-mono">{row.code}</td><td className="min-w-44 p-3 text-muted-foreground">{row.detail}</td><td className="min-w-36 space-y-2 p-3">{query.categoria === "productos" ? <Link className="inline-block py-2 font-semibold text-link" href={`/admin/productos/${row.id}`}>Ver detalles</Link> : null}<ArchiveRecordForm id={row.id} updatedAt={row.updatedAt.toISOString()} category={query.categoria} /></td></tr>)}</tbody>
        </table>
      </div>}
      <nav aria-label="Paginación de archivados" className="mt-5 flex flex-wrap items-center gap-3">
        {result.page > 1 ? <Link href={pageLink(result.page - 1)} className={buttonStyles({ variant: "outline", size: "sm" })}>Anterior</Link> : null}
        <span className="text-small">Página {result.page} de {result.pageCount}</span>
        {result.page < result.pageCount ? <Link href={pageLink(result.page + 1)} className={buttonStyles({ variant: "outline", size: "sm" })}>Siguiente</Link> : null}
      </nav>
    </section>
  </div>;
}
