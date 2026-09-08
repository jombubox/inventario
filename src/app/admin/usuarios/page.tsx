import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/features/auth/server/authorization";
import { getConfiguredAdmin } from "@/features/auth/server/env-admin";

export default async function EnvironmentAdminPage() {
  await requirePagePermission("USER_READ");
  const admin = getConfiguredAdmin();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Identidad única"
        title="Administrador"
        description="La identidad administrativa se configura exclusivamente con variables de entorno del servidor."
      />
      <Card>
        <CardContent className="grid gap-5 p-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nombre</p>
            <p className="mt-1 font-semibold text-navy">{admin.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correo</p>
            <p className="mt-1 break-all text-navy">{admin.email}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rol</p>
            <div className="mt-2"><Badge variant="primary">{admin.role}</Badge></div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Origen</p>
            <p className="mt-1 text-navy">Entorno del servidor</p>
          </div>
        </CardContent>
      </Card>
      <p className="text-small text-muted-foreground">
        La contraseña nunca se muestra ni se guarda en PostgreSQL. Los cambios se realizan en la
        configuración del entorno y requieren un nuevo despliegue.
      </p>
    </div>
  );
}
