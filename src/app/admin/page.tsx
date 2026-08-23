import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/db";
import { getDashboardData } from "@/features/admin/data/dashboard-queries";
import { hasPermission } from "@/features/auth/domain/permissions";
import { requirePagePermission } from "@/features/auth/server/authorization";
import { formatDateTime } from "@/lib/format";

const metricLabels = {
  activeProducts: "Productos activos",
  publicProducts: "Productos públicos",
  availableUnits: "Unidades disponibles",
  reservedUnits: "Unidades reservadas",
  soldUnits: "Unidades vendidas",
  unlocatedProducts: "Productos sin ubicación",
  withoutPartNumber: "Sin número de parte",
  withoutImage: "Sin imagen",
} as const;

export default async function AdminPage() {
  const actor = await requirePagePermission("DASHBOARD_VIEW");
  const data = await getDashboardData(getDb());

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7">
      <PageHeader
        eyebrow="Resumen operativo"
        title="Dashboard"
        description="Estado actual del catálogo y del inventario físico de JombuBox."
        actions={hasPermission(actor.role, "PRODUCT_CREATE") ? (
          <Link href="/admin/productos/nuevo" className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-small font-semibold text-white hover:bg-primary-hover">
            Nuevo producto
          </Link>
        ) : undefined}
      />

      <section aria-labelledby="metrics-title">
        <h2 id="metrics-title" className="sr-only">Indicadores principales</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(metricLabels).map(([key, label]) => (
            <Card key={key}>
              <CardContent className="p-5">
                <p className="text-small text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-navy">
                  {data.metrics[key as keyof typeof data.metrics].toLocaleString("es-MX")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Última importación</CardTitle><Link href="/admin/importar" className="text-small font-semibold text-primary hover:underline">Abrir importador</Link></CardHeader>
          <CardContent>{data.latestImport ? <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-navy">{data.latestImport.filename}</p><p className="mt-1 text-small text-muted-foreground">{data.latestImport.successfulRows} válidas · {data.latestImport.warningRows} con avisos · {data.latestImport.failedRows} omitidas/fallidas</p></div><div className="sm:text-right"><Badge variant={data.latestImport.status === "COMPLETED" ? "success" : data.latestImport.status === "FAILED" ? "danger" : "warning"}>{data.latestImport.status}</Badge><p className="mt-2 text-xs text-muted-foreground">{formatDateTime(data.latestImport.completedAt ?? data.latestImport.createdAt)}</p></div></div> : <EmptyState title="Aún no hay importaciones" description="Descarga la plantilla y valida el primer archivo XLSX." />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Errores de importación recientes</CardTitle><Badge variant={data.recentImportErrors.length > 0 ? "danger" : "neutral"}>{data.recentImportErrors.length}</Badge></CardHeader>
          <CardContent>{data.recentImportErrors.length > 0 ? <div className="divide-y divide-border">{data.recentImportErrors.map((job) => <div key={job.id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-small font-semibold text-navy">{job.filename}</p><p className="text-xs text-muted-foreground">{formatDateTime(job.createdAt)}</p></div><span className="text-small font-semibold text-danger">{job.status === "FAILED" ? "Falló" : `${job.failedRows} fila(s)`}</span></div>)}</div> : <p className="text-small text-muted-foreground">No hay fallos recientes que requieran atención.</p>}</CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Movimientos recientes</CardTitle>
            <Badge>{data.recentMovements.length}</Badge>
          </CardHeader>
          <CardContent>
            {data.recentMovements.length === 0 ? (
              <EmptyState title="Aún no hay movimientos" description="Los registros INITIAL, MOVE y ADJUSTMENT aparecerán aquí." />
            ) : (
              <div className="divide-y divide-border">
                {data.recentMovements.map((movement) => (
                  <div key={movement.id} className="flex gap-4 py-3 first:pt-0 last:pb-0">
                    <Badge variant="primary">{movement.type}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-small font-semibold text-navy">
                        {movement.inventoryCode} · {movement.productTitle}
                      </p>
                      <p className="mt-0.5 truncate text-small text-muted-foreground">
                        {movement.reason} · {movement.quantity} unidad(es)
                      </p>
                    </div>
                    <time className="hidden text-small text-muted-foreground sm:block">
                      {formatDateTime(movement.createdAt)}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Inventario por tipo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.inventoryByType.map((item) => (
              <div key={item.componentType} className="flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3">
                <div>
                  <p className="text-small font-semibold text-navy">{item.componentType}</p>
                  <p className="text-small text-muted-foreground">{item.availableStock} disponibles</p>
                </div>
                <span className="text-lg font-semibold text-navy">{item.physicalStock}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Productos actualizados recientemente</CardTitle>
          <Link href="/admin/productos" className="text-small font-semibold text-primary hover:underline">Ver productos</Link>
        </CardHeader>
        <CardContent>
          {data.recentProducts.length === 0 ? (
            <EmptyState title="Aún no hay productos" description="Crea el primer producto para comenzar a registrar inventario." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-small">
                <thead className="text-muted-foreground"><tr><th className="pb-3 font-medium">SKU</th><th className="pb-3 font-medium">Producto</th><th className="pb-3 font-medium">Estado</th><th className="pb-3 text-right font-medium">Actualizado</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {data.recentProducts.map((product) => (
                    <tr key={product.id}>
                      <td className="py-3 font-mono text-xs text-primary">{product.sku}</td>
                      <td className="py-3"><Link href={`/admin/productos/${product.id}`} className="font-semibold text-navy hover:text-primary">{product.title}</Link></td>
                      <td className="py-3"><Badge>{product.status}</Badge></td>
                      <td className="py-3 text-right text-muted-foreground">{formatDateTime(product.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
