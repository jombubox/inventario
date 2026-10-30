"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { ImagePreview } from "./image-preview";
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
  const [preview, setPreview] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();

  const [files, setFiles] = useState<File[]>([]);
  const { states, uploadState, retry } = usePhotoUploads(files, productId, canManage);
  const uploadedIds = files.filter((file) => states[photoUploadId(file)]?.status === "uploaded").map(photoUploadId);
  const accounted = new Set([...images.map(({ id }) => id), ...uploadedIds]).size;
  useEffect(() => { if (uploadState === "done" || uploadState === "error") router.refresh(); }, [router, uploadState]);
  useEffect(() => {
    if (uploadState !== "done" || !files.length || !files.every((file) => images.some(({ id }) => id === photoUploadId(file)))) return;
    // A picker validation can finish while this refresh cleanup is queued.
    // Remove only confirmed files; never discard a newer selection.
    const confirmedIds = new Set(images.map(({ id }) => id));
    const timer = window.setTimeout(() => setFiles((current) => current.filter((file) => !confirmedIds.has(photoUploadId(file)))), 0);
    return () => window.clearTimeout(timer);
  }, [files, images, uploadState]);
  const locked = uploadState === "uploading" || uploadState === "error" || busy !== null || refreshing || files.some((file) => !states[photoUploadId(file)]);

  async function mutate(label: string, callback: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await callback();
      startTransition(() => router.refresh());
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
    <Card data-testid="product-photo-manager">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-h3 text-navy">Fotos del producto</h2><p className="mt-1 text-small text-muted-foreground">Hasta 10 fotos JPEG, PNG o WebP de 10 MiB. La primera foto es la principal. Los cambios se guardan automáticamente.</p></div>

        </div>
        {error ? <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-small text-danger">{error}</p> : null}
        {canManage ? <PhotoSelection id="product-images" files={files} onChange={setFiles} states={states}
          hideUploaded locked={locked}
          existingCount={accounted - uploadedIds.length} onRetry={uploadState === "error" ? () => void retry() : undefined} /> : null}
        {ordered.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-small text-muted-foreground">Este producto todavía no tiene imágenes.</p> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((image, index) => <article key={image.id} data-image-id={image.id} className="min-w-0 overflow-hidden rounded-xl border border-border bg-background">
              <button type="button" className="relative block aspect-[4/3] w-full bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" aria-label={`Ver foto ${index + 1}`} disabled={!image.url} onClick={() => setPreview(image.id)}>
                {image.url ? <Image src={image.url} alt={image.alt ?? "Foto del producto"} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-contain" /> : <span className="text-small text-muted-foreground">Sin URL</span>}
                {image.isPrimary ? <Badge variant="primary" className="absolute left-2 top-2">Foto principal</Badge> : null}
              </button>
              <div className="space-y-3 p-3">
                <div><Label htmlFor={`alt-${image.id}`}>Texto alternativo</Label><Input id={`alt-${image.id}`} className="mt-1" value={altValues[image.id] ?? image.alt ?? ""} disabled={!canManage} onChange={(event) => setAltValues((current) => ({ ...current, [image.id]: event.target.value }))}/></div>
                {canManage ? <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={locked} onClick={() => void mutate(`alt-${image.id}`, () => jsonRequest(`/api/products/images/${image.id}`, { method: "PATCH", body: JSON.stringify({ alt: altValues[image.id] ?? image.alt ?? "" }) }))}>Guardar alt</Button>
                  {!image.isPrimary ? <Button size="sm" variant="outline" aria-label="Hacer foto principal" disabled={locked} onClick={() => void mutate(`primary-${image.id}`, () => jsonRequest(`/api/products/images/${image.id}`, { method: "PATCH", body: JSON.stringify({ makePrimary: true }) }))}>Hacer principal</Button> : null}
                  <Button size="sm" variant="ghost" aria-label="Mover foto a la izquierda" disabled={locked || index === 0} onClick={() => void move(image.id, -1)}>←</Button>
                  <Button size="sm" variant="ghost" aria-label="Mover foto a la derecha" disabled={locked || index === ordered.length - 1} onClick={() => void move(image.id, 1)}>→</Button>
                  <Button size="sm" variant="destructive" aria-label="Eliminar foto" disabled={locked} onClick={() => {
                    if (window.confirm("¿Eliminar esta imagen de R2 y Jombubox?")) void mutate(`delete-${image.id}`, async () => {
                      await jsonRequest(`/api/products/images/${image.id}`, { method: "DELETE" });
                      setFiles((current) => current.filter((file) => photoUploadId(file) !== image.id));
                    });
                  }}>Eliminar</Button>
                </div> : null}
              </div>
            </article>)}
          </div>
        )}
      </CardContent>
      {preview ? <Modal title="Fotos del producto" onClose={() => setPreview(null)}><ImagePreview title="Fotos del producto" images={ordered.filter((image) => image.url).map((image) => ({ url: image.url!, alt: image.alt ?? "Foto del producto" }))} initialIndex={ordered.filter((image) => image.url).findIndex(({ id }) => id === preview)} /></Modal> : null}
    </Card>
  );
}
