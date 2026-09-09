import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { ImportWizard } from "@/features/imports/components/import-wizard";
import { listRecentImportJobs } from "@/features/imports/data/import-queries";
import { getServerEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";

function jobVariant(status: string) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "FAILED") return "danger" as const;
  if (status === "PROCESSING") return "primary" as const;
  return "warning" as const;
}

export default async function ImportPage() {
  await requireAdmin();
  const history = await listRecentImportJobs(getDb());
  const importsEnabled = getServerEnv().ENABLE_IMPORTS;

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <PageHeader
        eyebrow="Migración controlada"
        title="Importar inventario"
        description="Mapea, valida y corrige archivos XLSX antes de crear productos o existencias. La previsualización no modifica el inventario."
        actions={<a href="/api/imports/template" className={buttonStyles({ variant: "outline" })}>Descargar plantilla XLSX</a>}
      />

      {importsEnabled ? <ImportWizard /> : <div className="rounded-xl border border-border bg-muted/50 p-4 text-small text-muted-foreground">Las importaciones están deshabilitadas temporalmente mediante configuración operativa. El historial y la plantilla permanecen disponibles.</div>}

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border p-5"><h2 className="font-semibold text-navy">Historial reciente</h2><p className="mt-1 text-small text-muted-foreground">Las previsualizaciones, confirmaciones y fallos quedan registrados para auditoría.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-small">
              <thead className="border-b border-border bg-muted/60 text-muted-foreground"><tr><th className="px-4 py-3">Archivo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Filas</th><th className="px-4 py-3">Resultado</th><th className="px-4 py-3">Atribución</th><th className="px-4 py-3">Fecha</th></tr></thead>
              <tbody className="divide-y divide-border">{history.map((job) => <tr key={job.id}><td className="max-w-xs truncate px-4 py-3 font-semibold text-navy">{job.filename}{job.forceDuplicate ? <p className="text-xs font-normal text-warning">Reimportación forzada</p> : null}</td><td className="px-4 py-3"><Badge variant={jobVariant(job.status)}>{job.status}</Badge></td><td className="px-4 py-3">{job.totalRows}</td><td className="px-4 py-3"><span className="text-success">{job.successfulRows} válidas</span> · <span className="text-warning">{job.warningRows} con avisos</span> · <span className="text-danger">{job.failedRows} omitidas/fallidas</span></td><td className="px-4 py-3">Sistema</td><td className="px-4 py-3 text-muted-foreground">{formatDateTime(job.completedAt ?? job.createdAt)}</td></tr>)}</tbody>
            </table>
          </div>
          {history.length === 0 ? <p className="p-6 text-small text-muted-foreground">Todavía no hay importaciones.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
