"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseApiResponse } from "@/features/images/domain/api-response";
import { PhotoSelection, photoUploadId } from "./photo-selection";
import { usePhotoUploads } from "./use-photo-uploads";

type ProductImage = {
  id: string;
  url: string | null;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

async function jsonRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  return parseApiResponse<T>(response, {
    fallbackError: "No fue posible completar la operación.",
  });
}

export function ProductImageManager({
  productId,
  images,
  canManage,
}: {
  productId: string;
  images: ProductImage[];
  canManage: boolean;
}) {
  const router = useRouter();
  const ordered = [...images].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || left.sortOrder - right.sortOrder);
  const [altValues, setAltValues] = useState<Record<string, string>>(
    Object.fromEntries(images.map((image) => [image.id, image.alt ?? ""])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const { states, uploadState, retry } = usePhotoUploads(files, productId, canManage);
  const uploadedIds = files.filter((file) => states[photoUploadId(file)]?.status === "uploaded").map(photoUploadId);
  const accounted = new Set([...images.map(({ id }) => id), ...uploadedIds]).size;
  useEffect(() => { if (uploadState === "done" || uploadState === "error") router.refresh(); }, [router, uploadState]);

  async function mutate(label: string, callback: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await callback();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible actualizar la imagen.");
    } finally {
      setBusy(null);
    }
  }

  function move(imageId: string, direction: -1 | 1) {
    const currentIndex = ordered.findIndex((image) => image.id === imageId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    const ids = ordered.map((image) => image.id);
    [ids[currentIndex], ids[nextIndex]] = [ids[nextIndex]!, ids[currentIndex]!];
    return mutate(`order-${imageId}`, () =>
      jsonRequest("/api/products/images/reorder", {
        method: "POST",
        body: JSON.stringify({ productId, imageIds: ids }),
      }),
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="font-semibold text-navy">Imágenes del producto</h2><p className="mt-1 text-small text-muted-foreground">Hasta 10 archivos JPEG, PNG o WEBP de 10 MB. La primera imagen queda como principal.</p></div>

        </div>
        {error ? <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-small text-danger">{error}</p> : null}
        {canManage ? <PhotoSelection id="product-images" files={files} onChange={setFiles} states={states}
          locked={uploadState === "uploading" || uploadState === "error"}
          existingCount={accounted - uploadedIds.length} onRetry={uploadState === "error" ? () => void retry() : undefined} /> : null}
        {ordered.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-small text-muted-foreground">Este producto todavía no tiene imágenes.</p> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((image, index) => <article key={image.id} className="overflow-hidden rounded-xl border border-border bg-background"><div className="relative aspect-[4/3] bg-muted">{image.url ? <Image src={image.url} alt={image.alt ?? "Imagen del producto"} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-contain" /> : <div className="grid h-full place-items-center text-small text-muted-foreground">Sin URL</div>}{image.isPrimary ? <Badge variant="primary" className="absolute left-2 top-2">Principal</Badge> : null}</div><div className="space-y-3 p-3"><div><Label htmlFor={`alt-${image.id}`}>Texto alternativo</Label><Input id={`alt-${image.id}`} className="mt-1" value={altValues[image.id] ?? image.alt ?? ""} disabled={!canManage} onChange={(event) => setAltValues((current) => ({ ...current, [image.id]: event.target.value }))}/></div>{canManage ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={uploadState === "uploading" || busy !== null} onClick={() => void mutate(`alt-${image.id}`, () => jsonRequest(`/api/products/images/${image.id}`, { method: "PATCH", body: JSON.stringify({ alt: altValues[image.id] ?? "" }) }))}>Guardar alt</Button>{!image.isPrimary ? <Button size="sm" variant="outline" aria-label="Hacer foto principal" disabled={uploadState === "uploading" || busy !== null} onClick={() => void mutate(`primary-${image.id}`, () => jsonRequest(`/api/products/images/${image.id}`, { method: "PATCH", body: JSON.stringify({ makePrimary: true }) }))}>Hacer principal</Button> : null}<Button size="sm" variant="ghost" aria-label="Mover foto a la izquierda" disabled={uploadState === "uploading" || busy !== null || index === 0} onClick={() => void move(image.id, -1)}>←</Button><Button size="sm" variant="ghost" aria-label="Mover foto a la derecha" disabled={uploadState === "uploading" || busy !== null || index === ordered.length - 1} onClick={() => void move(image.id, 1)}>→</Button><Button size="sm" variant="destructive" aria-label="Eliminar foto" disabled={uploadState === "uploading" || busy !== null} onClick={() => { if (window.confirm("¿Eliminar esta imagen de R2 y JombuBox?")) void mutate(`delete-${image.id}`, () => jsonRequest(`/api/products/images/${image.id}`, { method: "DELETE" })); }}>Eliminar</Button></div> : null}</div></article>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
