import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getDb } from "@/db";
import { inventoryMovementTypeValues } from "@/db/schema/enums";
import { requirePagePermission } from "@/features/auth/server/authorization";
import { listInventoryMovements } from "@/features/inventory/data/movement-queries";
import { formatDateTime } from "@/lib/format";
import { movementListQuerySchema } from "@/validators/admin-query";

type SearchParams = Record<string, string | string[] | undefined>;

function movementVariant(type: string) {
  if (["IN", "RETURN", "INITIAL"].includes(type)) return "success" as const;
  if (["OUT", "SALE"].includes(type)) return "danger" as const;
  if (type === "MOVE") return "primary" as const;
  return "warning" as const;
}

export default async function MovementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePagePermission("MOVEMENT_READ");
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const query = movementListQuerySchema.parse(raw);
  const { rows, total, pageCount, options } = await listInventoryMovements(getDb(), query);
  const current = new URLSearchParams(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const pageHref = (page: number) => { const next = new URLSearchParams(current); next.set("page", String(page)); return `/admin/movimientos?${next}`; };

  return <div className="mx-auto w-full max-w-[96rem] space-y-6">
    <PageHeader eyebrow="Trazabilidad física" title="Movimientos" description="Consulta entradas, salidas, traslados, ventas, devoluciones y ajustes sin perder su autor ni motivo." />
    <Card><CardContent className="p-5"><form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7"><Input name="q" defaultValue={query.q} placeholder="Inventario, SKU, producto o motivo" className="lg:col-span-2"/><Select name="type" defaultValue={query.type ?? ""}><option value="">Todos los tipos</option>{inventoryMovementTypeValues.map((type) => <option key={type}>{type}</option>)}</Select><Select name="userId" defaultValue={query.userId ?? ""}><option value="">Todos los usuarios</option>{options.users.map((entry) => <option key={entry.id} value={entry.id}>{entry.name || entry.email}</option>)}</Select><Select name="location" defaultValue={query.location ?? ""}><option value="">Cualquier ubicación</option>{options.locations.map((entry) => <option key={entry.id} value={entry.code}>{entry.code} · {entry.name}</option>)}</Select><Input name="from" type="date" defaultValue={query.from}/><Input name="to" type="date" defaultValue={query.to}/><button className="h-11 rounded-xl bg-navy px-4 text-small font-semibold text-white lg:col-start-7">Aplicar filtros</button></form></CardContent></Card>
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[70rem] text-left text-small"><thead className="border-b border-border bg-muted/60 text-muted-foreground"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Inventario / Producto</th><th className="px-4 py-3">Cantidad</th><th className="px-4 py-3">Ruta</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Usuario</th></tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.id} className="align-top"><td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(row.createdAt)}</td><td className="px-4 py-3"><Badge variant={movementVariant(row.type)}>{row.type}</Badge></td><td className="px-4 py-3"><Link href={`/admin/inventario?q=${encodeURIComponent(row.inventoryCode)}`} className="font-mono text-xs font-semibold text-primary">{row.inventoryCode}</Link><p className="mt-1 font-semibold text-navy">{row.sku} · {row.productTitle}</p></td><td className="px-4 py-3 font-semibold">{row.quantity}</td><td className="px-4 py-3"><p>{row.fromLocation ?? "Exterior"}</p><p className="text-muted-foreground">→ {row.toLocation ?? "Exterior"}</p></td><td className="max-w-sm px-4 py-3">{row.reason}</td><td className="px-4 py-3">{row.userName ?? row.userEmail ?? "Sistema"}</td></tr>)}</tbody></table></div>{rows.length === 0 ? <p className="p-8 text-center text-small text-muted-foreground">No hay movimientos para estos filtros.</p> : null}<div className="flex items-center justify-between border-t border-border p-4"><p className="text-small text-muted-foreground">{total} movimiento(s) · página {query.page} de {pageCount}</p><div className="flex gap-2"><Link aria-disabled={query.page <= 1} href={pageHref(Math.max(1, query.page - 1))} className="rounded-lg border border-border px-3 py-2 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-40">Anterior</Link><Link aria-disabled={query.page >= pageCount} href={pageHref(Math.min(pageCount, query.page + 1))} className="rounded-lg border border-border px-3 py-2 font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-40">Siguiente</Link></div></div></CardContent></Card>
  </div>;
}
