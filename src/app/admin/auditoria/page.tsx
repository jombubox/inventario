import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getDb } from "@/db";
import { auditActionValues } from "@/features/audit/data/audit-log";
import { AuditDiff } from "@/features/audit/components/audit-diff";
import { listAuditLogs } from "@/features/audit/data/audit-queries";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { formatDateTime } from "@/lib/format";
import { auditListQuerySchema } from "@/validators/admin-query";

type SearchParams = Record<string, string | string[] | undefined>;
const entityTypes = ["PRODUCT", "PRODUCT_IMAGE", "INVENTORY_ITEM", "LOCATION", "IMPORT_JOB"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const query = auditListQuerySchema.parse(raw);
  const { rows, total, pageCount } = await listAuditLogs(getDb(), query);
  const current = new URLSearchParams(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const pageHref = (page: number) => { const next = new URLSearchParams(current); next.set("page", String(page)); return `/admin/auditoria?${next}`; };

  return <div className="mx-auto w-full max-w-[96rem] space-y-6">
    <PageHeader eyebrow="Trazabilidad" title="Auditoría" description="Revisa qué cambió, cuándo ocurrió y qué valores se modificaron." />
    <Card><CardContent className="p-5"><form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><Input name="q" defaultValue={query.q} placeholder="Acción, entidad o UUID" className="lg:col-span-2"/><Select name="action" defaultValue={query.action ?? ""}><option value="">Todas las acciones</option>{auditActionValues.map((action) => <option key={action}>{action}</option>)}</Select><Select name="entityType" defaultValue={query.entityType ?? ""}><option value="">Todas las entidades</option>{entityTypes.map((type) => <option key={type}>{type}</option>)}</Select><Input name="from" type="date" defaultValue={query.from}/><Input name="to" type="date" defaultValue={query.to}/><button className="h-11 rounded-xl bg-navy px-4 text-small font-semibold text-white lg:col-start-6">Aplicar filtros</button></form></CardContent></Card>
    <div className="space-y-3">{rows.map((row) => <Card key={row.id}><CardContent className="p-0"><details><summary className="grid cursor-pointer gap-3 p-4 sm:grid-cols-[minmax(13rem,1fr)_minmax(12rem,1fr)_minmax(11rem,0.8fr)_auto] sm:items-center"><div><Badge variant="primary">{row.action}</Badge><p className="mt-2 font-mono text-xs text-muted-foreground">{row.id}</p></div><div><p className="font-semibold text-navy">{row.entityType}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{row.entityId}</p></div><p className="text-small">Sistema</p><time className="whitespace-nowrap text-small text-muted-foreground">{formatDateTime(row.createdAt)}</time></summary><div className="border-t border-border p-4"><AuditDiff before={row.before} after={row.after} metadata={row.metadata}/></div></details></CardContent></Card>)}</div>
    {rows.length === 0 ? <Card><CardContent className="p-8 text-center text-small text-muted-foreground">No hay eventos para estos filtros.</CardContent></Card> : null}
    <div className="flex items-center justify-between"><p className="text-small text-muted-foreground">{total} evento(s) · página {query.page} de {pageCount}</p><div className="flex gap-2"><Link aria-disabled={query.page <= 1} href={pageHref(Math.max(1, query.page - 1))} className="rounded-lg border border-border px-3 py-2 text-small font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-40">Anterior</Link><Link aria-disabled={query.page >= pageCount} href={pageHref(Math.min(pageCount, query.page + 1))} className="rounded-lg border border-border px-3 py-2 text-small font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-40">Siguiente</Link></div></div>
  </div>;
}
