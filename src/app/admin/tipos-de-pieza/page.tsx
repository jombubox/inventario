import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import {
  CatalogEntryEditor,
  CreateCatalogEntryForm,
} from "@/features/products/components/catalog-management";
import { listAdminComponentTypes } from "@/features/products/data/admin-catalog-queries";
import { catalogListQuerySchema } from "@/validators/admin-catalog";

export default async function PieceTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requireAdmin();
  const raw = await searchParams;
  const query = catalogListQuerySchema.parse({ q: Array.isArray(raw.q) ? raw.q[0] : raw.q });
  const rows = await listAdminComponentTypes(getDb(), query.q);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader eyebrow="Catálogo" title="Tipos de pieza" description="Organiza los nombres de las piezas que se usan en el catálogo." />
      <Card><CardContent className="p-5">
        <h2 className="text-h3">Agregar tipo de pieza</h2>
        <p className="mb-4 mt-1 text-small text-muted-foreground">Si ya existe con otras mayúsculas o espacios, se usará el existente.</p>
        <CreateCatalogEntryForm kind="componentType" />
      </CardContent></Card>
      <form method="get" className="flex gap-3">
        <Input name="q" defaultValue={query.q} aria-label="Buscar tipos de pieza" placeholder="Buscar tipo de pieza…" />
        <button className="min-h-11 rounded-md bg-action px-5 font-semibold text-action-foreground hover:bg-action-hover">Buscar</button>
      </form>
      {rows.length === 0 ? (
        <Card><CardContent className="p-8"><EmptyState
          title={query.q ? "No encontramos resultados para esta búsqueda." : "No hay tipos de pieza registrados."}
          description={query.q ? "Prueba con otro nombre o código." : "Agrega el primer tipo de pieza para comenzar."}
        /></CardContent></Card>
      ) : (
        <div className="space-y-3">{rows.map((entry) => <CatalogEntryEditor key={entry.id} entry={entry} kind="componentType" />)}</div>
      )}
    </div>
  );
}
