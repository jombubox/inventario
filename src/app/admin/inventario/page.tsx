import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminListFilters } from "@/components/forms/admin-list-filters";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { CreateInventoryForm, InventoryRowActions } from "@/features/inventory/components/inventory-forms";
import {
  listAdminInventory,
  listInventoryFormOptions,
} from "@/features/inventory/data/admin-inventory-queries";
import { formatDateTime, formatInventoryCondition, formatInventoryStatus } from "@/lib/format";
import { inventoryListQuerySchema } from "@/validators/admin-query";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const raw = await searchParams;
  const query = inventoryListQuerySchema.parse(
    Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : value,
      ]),
    ),
  );
  const db = getDb();
  const [{ rows, total, pageCount }, options] = await Promise.all([
    listAdminInventory(db, query),
    listInventoryFormOptions(db),
  ]);
  const current = new URLSearchParams(
    Object.entries(raw).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const pageLink = (page: number) => {
    const params = new URLSearchParams(current);
    params.set("page", String(page));
    return `/admin/inventario?${params}`;
  };

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <PageHeader
        eyebrow="Existencia física"
        title="Inventario"
        description="Consulta lotes, registra entradas y conserva el historial de cada cambio."
        actions={(
          <a
            href="/api/exports/inventory"
            className="inline-flex h-11 items-center rounded-md bg-card px-4 text-small font-semibold text-navy shadow-sm transition-colors hover:text-link"
          >
            Exportar inventario
          </a>
        )}
      />

      <details className="rounded-md bg-card shadow-sm">
          <summary className="cursor-pointer px-5 py-4 font-semibold text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Agregar existencia física
          </summary>
          <div className="border-t border-border p-5">
            <CreateInventoryForm
              products={options.products}
              locations={options.locations}
            />
          </div>
      </details>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <AdminListFilters className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7" label="Buscar inventario" placeholder="Código, SKU, parte, serie, marca, ubicación o caja">
            <Select aria-label="Condición" name="condition" defaultValue={query.condition ?? ""}>
              <option value="">Cualquier condición</option>
              <option value="NEW">Nuevo</option>
              <option value="USED_EXCELLENT">Usado excelente</option>
              <option value="USED_GOOD">Usado bueno</option>
              <option value="USED_FAIR">Usado regular</option>
              <option value="FOR_PARTS">Para partes</option>
              <option value="UNKNOWN">Desconocida</option>
            </Select>
            <Select aria-label="Estado" name="status" defaultValue={query.status ?? ""}>
              <option value="">Cualquier estado</option>
              <option value="AVAILABLE">Disponible</option>
              <option value="RESERVED">Reservado</option>
              <option value="SOLD">Vendido</option>
              <option value="DAMAGED">Dañado</option>
              <option value="SCRAPPED">Desechado</option>
            </Select>
            <Select aria-label="Ubicación" name="location" defaultValue={query.location ?? ""}>
              <option value="">Cualquier ubicación</option>
              {options.locations.map((location) => (
                <option key={location.id} value={location.code}>
                  {location.breadcrumb}
                </option>
              ))}
            </Select>
            <Select
              name="unlocated"
              defaultValue={query.unlocated ? "true" : ""}
            >
              <option value="">Con y sin ubicación</option>
              <option value="true">Solo sin ubicación</option>
            </Select>
            <Button type="submit">Aplicar filtros</Button>
          </AdminListFilters>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No encontramos inventario con esa búsqueda." action={<Link href="/admin/inventario" className="font-semibold text-link">Limpiar búsqueda y filtros</Link>}
                description="Registra una existencia o ajusta los filtros de búsqueda."
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((item) => (
                <article key={item.id} className="p-4 sm:p-5">
                  <div className="grid gap-3 md:grid-cols-[1fr_1.5fr_0.5fr_0.7fr_1.2fr] md:items-center">
                    <div>
                      <p className="font-mono text-xs font-bold text-link">
                        {item.inventoryCode}
                      </p>
                      <p className="mt-1 text-small text-muted-foreground">
                        {item.sku}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-navy">{item.productTitle}</p>
                      <p className="mt-1 text-small text-muted-foreground">
                        {item.legacyBagNumber
                          ? item.legacyBagNumber
                          : "Sin bolsa"}{" "}
                        · {item.legacyLocationCode ?? "sin código legacy"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xl font-semibold text-navy">
                        {item.quantity}
                      </p>
                      <p className="text-xs text-muted-foreground">unidades</p>
                    </div>
                    <div className="flex flex-col items-start gap-1">
                      <Badge
                        variant={item.status === "AVAILABLE" ? "success" : "neutral"}
                      >
                        {formatInventoryStatus(item.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatInventoryCondition(item.condition)}
                      </span>
                    </div>
                    <div>
                      <p className="text-small font-semibold text-navy">
                        {item.locationBreadcrumb ?? "Sin ubicación"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(item.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <details className="mt-4">
                      <summary className="cursor-pointer rounded-lg bg-muted px-3 py-2 text-small font-semibold text-navy">
                        Mover, ajustar o editar este registro
                      </summary>
                      <div className="mt-3">
                        <InventoryRowActions
                          item={{
                            id: item.id,
                            quantity: item.quantity,
                            condition: item.condition,
                            status: item.status,
                            locationId: item.locationId,
                            acquiredAt: item.acquiredAt
                              ? item.acquiredAt.toISOString().slice(0, 10)
                              : null,
                            acquisitionSource: item.acquisitionSource,
                            purchaseCost: item.purchaseCost,
                            notes: item.notes,
                            legacyBagNumber: item.legacyBagNumber,
                            legacyLocationCode: item.legacyLocationCode,
                            updatedAt: item.updatedAt.toISOString(),
                          }}
                          locations={options.locations}
                        />
                      </div>
                  </details>
                </article>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border p-4">
            <p className="text-small text-muted-foreground">
              {total} registro(s) · página {query.page} de {pageCount}
            </p>
            <div className="flex gap-2">
              <Link
                href={pageLink(Math.max(1, query.page - 1))}
                aria-disabled={query.page <= 1}
                className="rounded-lg border border-border px-3 py-2 text-small font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-40"
              >
                Anterior
              </Link>
              <Link
                href={pageLink(Math.min(pageCount, query.page + 1))}
                aria-disabled={query.page >= pageCount}
                className="rounded-lg border border-border px-3 py-2 text-small font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-40"
              >
                Siguiente
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
