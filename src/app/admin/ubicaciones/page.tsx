import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import {
  CreateLocationForm,
  EditLocationForm,
} from "@/features/locations/components/location-forms";
import { listAdminLocations } from "@/features/locations/data/admin-location-queries";

export default async function LocationsPage() {
  await requireAdmin();
  const rows = await listAdminLocations(getDb());
  const options = rows.map(({ id, breadcrumb }) => ({ id, breadcrumb }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Mapa físico"
        title="Ubicaciones"
        description="Organiza almacenes, estantes, cajas y bolsas con una jerarquía flexible."
      />

      <details className="rounded-2xl border border-border bg-card">
          <summary className="cursor-pointer px-5 py-4 font-semibold text-navy">
            Crear ubicación
          </summary>
          <div className="border-t border-border p-5">
            <CreateLocationForm options={options} />
          </div>
      </details>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="Aún no hay ubicaciones"
                description="Crea el almacén raíz y después agrega sus estantes, cajas o bolsas."
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((location) => (
                <article key={location.id} className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                      style={{
                        marginLeft: `${Math.min(location.depth, 8) * 0.75}rem`,
                      }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-navy">{location.name}</h2>
                        <Badge>{location.type}</Badge>
                        {location.active ? (
                          <Badge variant="success">Activa</Badge>
                        ) : (
                          <Badge variant="warning">Inactiva</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-small text-muted-foreground">
                        {location.code} · {location.breadcrumb}
                      </p>
                      {location.notes ? (
                        <p className="mt-1 text-small text-muted-foreground">
                          {location.notes}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <details className="mt-3">
                      <summary className="cursor-pointer rounded-lg bg-muted px-3 py-2 text-small font-semibold">
                        Editar datos o cambiar ubicación padre
                      </summary>
                      <div className="mt-3">
                        <EditLocationForm
                          location={{
                            id: location.id,
                            code: location.code,
                            name: location.name,
                            type: location.type,
                            parentId: location.parentId,
                            active: location.active,
                            notes: location.notes,
                            updatedAt: location.updatedAt.toISOString(),
                          }}
                          options={options}
                        />
                      </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
