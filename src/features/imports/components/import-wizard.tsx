"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type {
  AnalyzedImportRow,
  ImportCorrection,
  ImportDefaults,
  ImportField,
  ImportMapping,
  ImportPreview,
} from "@/features/imports/domain/import-types";
import {
  defaultImportDefaults,
  importFieldValues,
} from "@/features/imports/domain/import-types";

const PAGE_SIZE = 50;

const fieldLabels: Record<ImportField, string> = {
  legacyBagNumber: "Bolsa legacy",
  existingSku: "SKU existente",
  brand: "Marca",
  compatibleModel: "Modelo compatible",
  componentType: "Tipo de componente",
  partNumber: "Número de parte",
  condition: "Condición",
  quantity: "Cantidad",
  inventoryStatus: "Estado de inventario",
  salePrice: "Precio de venta",
  currency: "Moneda",
  acquiredAt: "Fecha de adquisición",
  acquisitionSource: "Origen",
  purchaseCost: "Costo de compra",
  boxCode: "Código de caja",
  locationCode: "Código de ubicación",
  isPublic: "Público",
  titleOverride: "Título manual",
  description: "Descripción",
  internalNotes: "Notas internas",
  legacyTitle: "Título legacy",
  legacyLocationCode: "Ubicación legacy (SKU/J1B#)",
  legacyExtra: "Columna legacy adicional",
};

type ImportResult = {
  jobId: string;
  productsCreated: number;
  inventoryItemsCreated: number;
  compatibilitiesAdded: number;
  omittedRows: number;
};

async function postImport<T>(path: string, file: File, options: unknown): Promise<T> {
  const body = new FormData();
  body.set("file", file);
  body.set("options", JSON.stringify(options));
  const response = await fetch(path, { method: "POST", body });
  const payload = (await response.json()) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error ?? "La solicitud no pudo completarse.");
  return payload;
}

function statusVariant(status: AnalyzedImportRow["status"]) {
  if (status === "VALID") return "success" as const;
  if (status === "WARNING") return "warning" as const;
  return "danger" as const;
}

function correctionValue(
  corrections: Record<number, ImportCorrection>,
  row: number,
  field: keyof ImportCorrection,
) {
  const value = corrections[row]?.[field];
  return typeof value === "string" ? value : "";
}

export function ImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [defaults, setDefaults] = useState<ImportDefaults>(defaultImportDefaults);
  const [corrections, setCorrections] = useState<Record<number, ImportCorrection>>({});
  const [filter, setFilter] = useState<"ALL" | AnalyzedImportRow["status"]>("ALL");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<"analyze" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [forceDuplicateFile, setForceDuplicateFile] = useState(false);
  const [includeDuplicateRows, setIncludeDuplicateRows] = useState(false);
  const [includePreviouslyImported, setIncludePreviouslyImported] = useState(false);
  const [previewStale, setPreviewStale] = useState(false);

  const filteredRows = useMemo(
    () => preview?.rows.filter((row) => filter === "ALL" || row.status === filter) ?? [],
    [filter, preview],
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateCorrection(rowNumber: number, patch: Partial<ImportCorrection>) {
    setPreviewStale(true);
    setCorrections((current) => ({
      ...current,
      [rowNumber]: { ...current[rowNumber], ...patch },
    }));
  }

  async function analyze() {
    if (!file) {
      setError("Selecciona un archivo XLSX.");
      return;
    }
    setBusy("analyze");
    setError(null);
    setResult(null);
    try {
      const next = await postImport<ImportPreview>("/api/imports/analyze", file, {
        jobId: preview?.jobId,
        mapping: Object.keys(mapping).length > 0 ? mapping : undefined,
        defaults,
        corrections,
      });
      setPreview(next);
      setMapping(next.mapping);
      setPage(1);
      setConfirmed(false);
      setPreviewStale(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible analizar el archivo.");
    } finally {
      setBusy(null);
    }
  }

  function downloadErrorReport() {
    if (!preview) return;
    const escape = (value: unknown) => {
      let valueText = String(value ?? "");
      if (/^[=+\-@]/u.test(valueText)) valueText = `'${valueText}`;
      return `"${valueText.replace(/"/gu, '""')}"`;
    };
    const csv = [
      ["Fila", "Estado", "Acción", "Coincidencia", "Códigos", "Mensajes", "SKU propuesto", "Ubicación legacy"],
      ...preview.rows.filter((row) => row.status !== "VALID").map((row) => [
        row.rowNumber,
        row.status,
        row.action,
        row.matchKind,
        row.messages.map((message) => message.code).join(" | "),
        row.messages.map((message) => message.message).join(" | "),
        row.normalized.proposedSku,
        row.normalized.legacyLocationCode,
      ]),
    ].map((row) => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `JombuBox_Import_Errores_${preview.jobId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function confirmImport() {
    if (!file || !preview || !confirmed) return;
    setBusy("confirm");
    setError(null);
    try {
      const next = await postImport<ImportResult>("/api/imports/confirm", file, {
        jobId: preview.jobId,
        mapping,
        defaults,
        corrections,
        forceDuplicateFile,
        includeDuplicateRows,
        includePreviouslyImported,
      });
      setResult(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible confirmar la importación.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <ol className="grid gap-3 text-small sm:grid-cols-3" aria-label="Pasos de importación">
        {["1. Archivo y reglas", "2. Mapeo y revisión", "3. Confirmación"].map((label, index) => (
          <li
            key={label}
            className={`rounded-xl border px-4 py-3 font-semibold ${
              (index === 0 && !preview) || (index === 1 && preview && !result) || (index === 2 && result)
                ? "border-primary bg-primary-soft text-primary-active"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {label}
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(8rem,0.5fr))_auto] xl:items-end">
          <div>
            <Label htmlFor="import-file">Archivo XLSX</Label>
            <Input
              id="import-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-2"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
                setMapping({});
                setCorrections({});
                setConfirmed(false);
                setForceDuplicateFile(false);
                setIncludeDuplicateRows(false);
                setIncludePreviouslyImported(false);
                setPreviewStale(false);
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">Máximo 8 MB, 2,000 filas, 5 hojas y 64 columnas.</p>
          </div>
          <div>
            <Label htmlFor="default-condition">Condición predeterminada</Label>
            <Select id="default-condition" className="mt-2" value={defaults.condition} onChange={(event) => { setDefaults({ ...defaults, condition: event.target.value as ImportDefaults["condition"] }); if (preview) setPreviewStale(true); }}>
              {['UNKNOWN', 'NEW', 'USED_EXCELLENT', 'USED_GOOD', 'USED_FAIR', 'FOR_PARTS'].map((value) => <option key={value}>{value}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="default-status">Estado predeterminado</Label>
            <Select id="default-status" className="mt-2" value={defaults.inventoryStatus} onChange={(event) => { setDefaults({ ...defaults, inventoryStatus: event.target.value as ImportDefaults["inventoryStatus"] }); if (preview) setPreviewStale(true); }}>
              {['AVAILABLE', 'RESERVED', 'DAMAGED'].map((value) => <option key={value}>{value}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="default-currency">Moneda predeterminada</Label>
            <Input id="default-currency" className="mt-2 uppercase" value={defaults.currency} maxLength={3} onChange={(event) => { setDefaults({ ...defaults, currency: event.target.value.toUpperCase() }); if (preview) setPreviewStale(true); }} />
          </div>
          <div>
            <Label htmlFor="default-public">Visibilidad</Label>
            <Select id="default-public" className="mt-2" value={String(defaults.isPublic)} onChange={(event) => { setDefaults({ ...defaults, isPublic: event.target.value === "true" }); if (preview) setPreviewStale(true); }}>
              <option value="false">Interno</option><option value="true">Público</option>
            </Select>
          </div>
          <Button onClick={analyze} isLoading={busy === "analyze"} loadingLabel="Analizando" disabled={!file || busy !== null}>Previsualizar</Button>
        </CardContent>
      </Card>

      {error ? <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-small text-danger">{error}</div> : null}
      {result ? (
        <div role="status" className="rounded-xl border border-success/30 bg-success/10 p-5 text-success">
          <p className="font-semibold">Importación completada</p>
          <p className="mt-1 text-small">{result.productsCreated} producto(s), {result.inventoryItemsCreated} registro(s) de inventario y {result.compatibilitiesAdded} compatibilidad(es) creadas. {result.omittedRows} fila(s) omitidas o fallidas.</p>
        </div>
      ) : null}

      {preview ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="Resumen de previsualización">
            {[
              ["Filas", preview.summary.totalRows],
              ["Válidas", preview.summary.validRows],
              ["Advertencias", preview.summary.warningRows],
              ["Errores", preview.summary.errorRows],
              ["Productos nuevos", preview.summary.newProducts],
              ["Inventarios", preview.summary.inventoryItems],
            ].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold text-navy">{value}</p></CardContent></Card>)}
          </section>

          {preview.duplicateFile ? <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-small text-warning">El contenido exacto de este archivo ya aparece en una importación completada. Solo podrás repetirlo con confirmación explícita.</div> : null}
          {previewStale ? <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-small font-semibold text-warning">El mapeo, los valores predeterminados o las correcciones cambiaron. Vuelve a validar antes de confirmar.</div> : null}

          <Card>
            <CardContent className="p-5">
              <details>
                <summary className="cursor-pointer font-semibold text-navy">Mapeo detectado · hoja {preview.sheetName}, encabezado en fila {preview.headerRow}</summary>
                <p className="mt-2 text-small text-muted-foreground">Corrige cualquier columna y vuelve a previsualizar. El encabezado “SKU” de archivos legacy se mapea a ubicación legacy, nunca a ExistingSKU.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {importFieldValues.map((field) => <div key={field}><Label htmlFor={`map-${field}`}>{fieldLabels[field]}</Label><Select id={`map-${field}`} className="mt-1" value={mapping[field] ?? ""} onChange={(event) => { setMapping((current) => ({ ...current, [field]: event.target.value || undefined })); setPreviewStale(true); }}><option value="">Sin mapear</option>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</Select></div>)}
                </div>
                <Button className="mt-4" variant="outline" onClick={analyze} isLoading={busy === "analyze"}>Aplicar mapeo y revisar de nuevo</Button>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold text-navy">Vista previa por fila</p><p className="text-small text-muted-foreground">Se muestran como máximo {PAGE_SIZE} filas por página.</p></div>
                <div className="flex flex-wrap gap-2">{preview.summary.warningRows + preview.summary.errorRows > 0 ? <Button size="sm" variant="outline" onClick={downloadErrorReport}>Descargar reporte CSV</Button> : null}<Select aria-label="Filtrar estado" className="max-w-48" value={filter} onChange={(event) => { setFilter(event.target.value as typeof filter); setPage(1); }}><option value="ALL">Todos los estados</option><option value="VALID">Válidas</option><option value="WARNING">Advertencias</option><option value="ERROR">Errores</option></Select></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[72rem] text-left text-small">
                  <thead className="border-b border-border bg-muted/60 text-muted-foreground"><tr><th className="px-4 py-3">Fila</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acción / coincidencia</th><th className="px-4 py-3">Producto propuesto</th><th className="px-4 py-3">Inventario</th><th className="px-4 py-3">Observaciones y corrección</th></tr></thead>
                  <tbody className="divide-y divide-border">{visibleRows.map((row) => <tr key={row.rowNumber} className="align-top"><td className="px-4 py-4 font-mono">{row.rowNumber}</td><td className="px-4 py-4"><Badge variant={statusVariant(row.status)}>{row.status}</Badge>{row.duplicateInFile ? <p className="mt-2 text-xs text-warning">Duplicada en archivo</p> : null}{row.previouslyImported ? <p className="mt-1 text-xs text-warning">Ya importada</p> : null}</td><td className="px-4 py-4"><p className="font-semibold">{row.action}</p><p className="mt-1 text-muted-foreground">{row.matchKind}</p></td><td className="max-w-xs px-4 py-4"><p className="font-mono text-xs text-primary">{row.normalized.matchedSku ?? row.normalized.proposedSku ?? "—"}</p><p className="mt-1 font-semibold text-navy">{row.normalized.title ?? "Sin título"}</p><p className="mt-1 text-muted-foreground">{row.normalized.brandName ?? row.normalized.brandRaw ?? "—"} · {row.normalized.partNumber ?? row.normalized.compatibleModel ?? "sin identidad"}</p></td><td className="px-4 py-4"><p>{row.normalized.quantity} pza. · {row.normalized.condition}</p><p className="mt-1 text-muted-foreground">{row.normalized.locationBreadcrumb ?? row.normalized.legacyLocationCode ?? "Sin ubicación"}</p></td><td className="max-w-md px-4 py-4"><ul className="space-y-1">{row.messages.map((message) => <li key={`${message.code}-${message.message}`} className={message.level === "ERROR" ? "text-danger" : "text-warning"}>{message.message}</li>)}</ul><details className="mt-3"><summary className="cursor-pointer font-semibold text-primary">Corregir fila</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><Input aria-label={`Marca fila ${row.rowNumber}`} placeholder="Marca" value={correctionValue(corrections, row.rowNumber, "brand")} onChange={(event) => updateCorrection(row.rowNumber, { brand: event.target.value })}/><Input aria-label={`Tipo fila ${row.rowNumber}`} placeholder="Tipo" value={correctionValue(corrections, row.rowNumber, "componentType")} onChange={(event) => updateCorrection(row.rowNumber, { componentType: event.target.value })}/><Input aria-label={`Parte fila ${row.rowNumber}`} placeholder="Número de parte" value={correctionValue(corrections, row.rowNumber, "partNumber")} onChange={(event) => updateCorrection(row.rowNumber, { partNumber: event.target.value })}/><Input aria-label={`Modelo fila ${row.rowNumber}`} placeholder="Modelo compatible" value={correctionValue(corrections, row.rowNumber, "compatibleModel")} onChange={(event) => updateCorrection(row.rowNumber, { compatibleModel: event.target.value })}/><Input aria-label={`Costo fila ${row.rowNumber}`} placeholder="Costo" value={correctionValue(corrections, row.rowNumber, "purchaseCost")} onChange={(event) => updateCorrection(row.rowNumber, { purchaseCost: event.target.value })}/><Input aria-label={`SKU existente fila ${row.rowNumber}`} placeholder="ExistingSKU" value={correctionValue(corrections, row.rowNumber, "existingSku")} onChange={(event) => updateCorrection(row.rowNumber, { existingSku: event.target.value })}/><label className="col-span-full flex items-center gap-2 text-xs"><input type="checkbox" checked={corrections[row.rowNumber]?.forceNew ?? false} onChange={(event) => updateCorrection(row.rowNumber, { forceNew: event.target.checked })}/>Crear producto nuevo pese a la coincidencia posible</label></div></details></td></tr>)}</tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border p-4"><p className="text-small text-muted-foreground">{filteredRows.length} fila(s) · página {page} de {pageCount}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Siguiente</Button></div></div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div><p className="font-semibold text-navy">Confirmación final</p><p className="mt-1 text-small text-muted-foreground">Si cambiaste una corrección, vuelve a previsualizar antes de confirmar. El servidor releerá el archivo, comprobará su hash y aplicará cada fila en una transacción aislada.</p></div>
              <div className="grid gap-2 text-small">
                {preview.duplicateFile ? <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={forceDuplicateFile} onChange={(event) => setForceDuplicateFile(event.target.checked)}/><span>Entiendo que este archivo exacto ya fue completado y autorizo otra importación.</span></label> : null}
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={includeDuplicateRows} onChange={(event) => setIncludeDuplicateRows(event.target.checked)}/><span>Incluir filas idénticas repetidas dentro del archivo.</span></label>
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={includePreviouslyImported} onChange={(event) => setIncludePreviouslyImported(event.target.checked)}/><span>Incluir huellas de filas que aparecen en importaciones anteriores.</span></label>
                <label className="flex items-start gap-2 font-semibold"><input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/><span>Revisé el resumen, los errores y las advertencias; confirmo la creación de productos e inventario.</span></label>
              </div>
              <div className="flex flex-wrap gap-3"><Button onClick={analyze} variant="outline" isLoading={busy === "analyze"}>Volver a validar</Button><Button onClick={confirmImport} isLoading={busy === "confirm"} loadingLabel="Importando" disabled={!confirmed || previewStale || result !== null || (preview.duplicateFile && !forceDuplicateFile)}>Confirmar importación</Button></div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
