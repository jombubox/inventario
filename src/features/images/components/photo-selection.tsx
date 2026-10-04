"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { allowedImageMimeTypes, assertSafeImageDescription, imageSignatureHex, MAX_IMAGE_BYTES, MAX_PRODUCT_IMAGES } from "@/features/images/domain/image-policy";

const uploadIds = new WeakMap<File, string>();
export function photoUploadId(file: File) {
  let id = uploadIds.get(file);
  if (!id) { id = crypto.randomUUID(); uploadIds.set(file, id); }
  return id;
}
export type PhotoState = { status: "selected" | "uploading" | "uploaded" | "failed"; error?: string; progress?: number };

function PhotoThumbnail({ file }: { file: File }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const element = ref.current;
    if (element) element.style.backgroundImage = `url("${url}")`;
    return () => { if (element) element.style.backgroundImage = ""; URL.revokeObjectURL(url); };
  }, [file]);
  return <div ref={ref} role="img" aria-label={file.name} className="aspect-square rounded-md bg-white bg-contain bg-center bg-no-repeat" />;
}

export function PhotoSelection({ files, onChange, id, states = {}, locked = false, existingCount = 0, onValidating, onRetry }: {
  files: File[]; onChange: (files: File[]) => void; id: string;
  states?: Record<string, PhotoState>; locked?: boolean; existingCount?: number;
  onValidating?: (validating: boolean) => void; onRetry?: () => void;
}) {
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function addFiles(selected: File[]) {
    if (!selected.length || validating) return;
    setValidating(true); onValidating?.(true); setError("");
    try {
      const next = [...files];
      for (const file of selected) {
        const quick = id === "quick-product-photos";
        if (!allowedImageMimeTypes.includes(file.type as typeof allowedImageMimeTypes[number])) {
          throw new Error(quick ? `${file.name} no es una imagen JPEG, PNG o WEBP.` : `${file.name} no es JPEG, PNG ni WEBP.`);
        }
        if (file.size > MAX_IMAGE_BYTES) throw new Error(quick ? `${file.name} supera el límite de 10 MB.` : `${file.name} supera 10 MB.`);
        let duplicate = false;
        for (const entry of next.filter((entry) => entry.name === file.name && entry.size === file.size && entry.type === file.type)) {
          const [left, right] = await Promise.all([entry.arrayBuffer(), file.arrayBuffer()]);
          const a = new Uint8Array(left), b = new Uint8Array(right);
          if (a.every((byte, index) => byte === b[index])) { duplicate = true; break; }
        }
        if (duplicate) continue;
        assertSafeImageDescription({ filename: file.name, mimeType: file.type, size: file.size,
          signatureHex: imageSignatureHex(new Uint8Array(await file.slice(0, 12).arrayBuffer())) });
        next.push(file);
      }
      if (next.length + existingCount > MAX_PRODUCT_IMAGES) throw new Error("Puedes agregar como máximo 10 fotos.");
      if (mounted.current) onChange(next);
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "No fue posible seleccionar las fotos.");
    } finally {
      if (mounted.current) { setValidating(false); onValidating?.(false); }
    }
  }
  function move(index: number, destination: number) {
    const next = [...files]; const [file] = next.splice(index, 1); next.splice(destination, 0, file!); onChange(next);
  }
  return <section aria-label="Fotos del producto" className="space-y-3 text-left">
    {!locked ? <div>
      <Label htmlFor={id}>Fotos del producto</Label>
      <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG o WebP; hasta 10 MB por foto. La primera será la principal.</p>
      <input id={id} aria-label={id === "quick-product-photos" ? "+ Agregar fotos" : "Subir imágenes"} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={validating}
        className="mt-2 block w-full min-w-0 rounded-md border border-input bg-field p-2 text-small focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => { const selected = Array.from(event.target.files ?? []); event.target.value = ""; void addFiles(selected); }} />
    </div> : null}
    {validating ? <p role="status" className="text-small">Verificando fotos…</p> : null}
    {error ? <p role="alert" className="text-small text-danger">{error}</p> : null}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {files.map((file, index) => {
        const state = states[photoUploadId(file)] ?? { status: "selected" };
        return <article key={photoUploadId(file)} className="min-w-0 rounded-md border border-border bg-card p-2" data-photo-state={state.status}>
          <PhotoThumbnail file={file} />
          <p className="mt-2 truncate text-xs" title={file.name}>{file.name}</p>
          {!existingCount && index === 0 ? <p className="mt-1 rounded-sm bg-primary-soft px-2 py-1 text-xs font-semibold text-foreground">Foto principal</p> : null}
          <p role="status" className={`mt-1 text-xs ${state.status === "failed" ? "text-danger" : "text-muted-foreground"}`}>
            {{ selected: "Seleccionada", uploading: "Subiendo…", uploaded: "Guardada", failed: "Error al subir" }[state.status]}
            {state.status === "uploading" && state.progress !== undefined ? ` ${state.progress}%` : ""}
          </p>
          {state.error ? <p className="mt-1 break-words text-xs text-danger">{state.error}</p> : null}
          {state.status === "failed" && onRetry ? <Button type="button" variant="outline" size="sm" onClick={onRetry} aria-label={`Reintentar subida de ${file.name}`}>Reintentar subida</Button> : null}
          {!locked && state.status === "selected" ? <div className="mt-2 flex flex-wrap gap-1">
            {index > 0 ? <Button type="button" size="sm" variant="outline" disabled={validating} aria-label={`Hacer foto principal: ${file.name}`} onClick={() => move(index, 0)}>Hacer principal</Button> : null}
            <Button type="button" size="sm" variant="ghost" disabled={validating || index === 0} aria-label={`Mover foto a la izquierda: ${file.name}`} onClick={() => move(index, index - 1)}>←</Button>
            <Button type="button" size="sm" variant="ghost" disabled={validating || index === files.length - 1} aria-label={`Mover foto a la derecha: ${file.name}`} onClick={() => move(index, index + 1)}>→</Button>
            <Button type="button" size="sm" variant="ghost" disabled={validating} aria-label={`Eliminar foto: ${file.name}`} title="Eliminar foto" onClick={() => onChange(files.filter((_, position) => position !== index))}>Eliminar foto</Button>
          </div> : null}
        </article>;
      })}
    </div>
  </section>;
}
