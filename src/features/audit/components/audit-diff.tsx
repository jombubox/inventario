function presentValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "Vacío";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export function AuditDiff({
  before,
  after,
  metadata,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const changed = keys.filter((key) => presentValue(before?.[key]) !== presentValue(after?.[key]));
  return <div className="space-y-3">
    {changed.length > 0 ? <dl className="divide-y divide-border rounded-lg border border-border">{changed.map((key) => <div key={key} className="grid gap-1 px-3 py-2 sm:grid-cols-[11rem_1fr_1fr]"><dt className="font-mono text-xs font-semibold text-navy">{key}</dt><dd><span className="mr-2 text-xs font-semibold uppercase text-danger">Antes</span>{presentValue(before?.[key])}</dd><dd><span className="mr-2 text-xs font-semibold uppercase text-success">Después</span>{presentValue(after?.[key])}</dd></div>)}</dl> : <p className="text-small text-muted-foreground">Este evento no registró cambios de campos.</p>}
    {metadata && Object.keys(metadata).length > 0 ? <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contexto</p><dl className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(metadata).map(([key, value]) => <div key={key} className="rounded-lg bg-muted px-3 py-2"><dt className="font-mono text-xs text-muted-foreground">{key}</dt><dd className="mt-1 break-words text-small">{presentValue(value)}</dd></div>)}</dl></div> : null}
  </div>;
}
