"use client";

import Image from "next/image";
import { useState } from "react";
import { CursorZoom } from "./cursor-zoom";
import { Button } from "@/components/ui/button";
import { ProductImagePlaceholder } from "@/features/catalog/components/product-image";

export type PreviewImage = { url: string; alt: string };

export function PreviewPhoto({ image, sizes, className = "", preload = false }: {
  image: PreviewImage; sizes: string; className?: string; preload?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return failedUrl === image.url ? <ProductImagePlaceholder className="absolute inset-0 h-full w-full [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:p-2" />
    : <Image src={image.url} alt={image.alt} fill sizes={sizes} preload={preload} onError={() => setFailedUrl(image.url)} className={`object-contain ${className}`} />;
}

function OriginalPhoto({ image, label }: { image: PreviewImage; label: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  return <div className="relative">
    <CursorZoom className="h-[min(55dvh,32rem)] rounded-md bg-white" label={label}>
      <Image src={image.url} alt={image.alt} fill unoptimized sizes="100vw" className="object-contain p-2"
        onLoad={() => setState("ready")} onError={() => setState("error")} />
    </CursorZoom>
    {state === "loading" ? <p role="status" className="absolute inset-x-0 bottom-3 rounded-md bg-card/90 p-2 text-center text-small">Cargando foto original…</p> : null}
    {state === "error" ? <div role="alert" className="absolute inset-0 grid place-content-center gap-2 bg-card p-5 text-center text-small">
      <ProductImagePlaceholder className="mx-auto size-20" />
      <p>No fue posible cargar la foto original.</p>
      <p className="text-muted-foreground">Cierra y vuelve a abrir la foto para reintentar.</p>
    </div> : null}
  </div>;
}

export function ImagePreview({ images, initialIndex = 0, title }: {
  images: PreviewImage[]; initialIndex?: number; title: string;
}) {
  const [index, setIndex] = useState(initialIndex);
  const selectedIndex = Math.min(index, Math.max(0, images.length - 1));
  const image = images[selectedIndex];
  const move = (direction: number) => setIndex((selectedIndex + direction + images.length) % images.length);
  if (!image) return <p className="text-muted-foreground">Este producto no tiene fotos registradas.</p>;
  return <div onKeyDown={(event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1);
    }
  }}>
    <OriginalPhoto key={image.url} image={{ ...image, alt: image.alt || title }} label={`Imagen ${selectedIndex + 1} de ${images.length}`} />
    <p className="mt-2 text-xs text-muted-foreground">En computadora, mueve el cursor sobre la foto para acercar.</p>
    <div className="mt-3 flex items-center justify-between gap-2">
      <Button type="button" variant="outline" size="sm" disabled={images.length < 2} onClick={() => move(-1)}>Anterior</Button>
      <p role="status" aria-label="Posición de la foto" className="text-small">{selectedIndex + 1} de {images.length}</p>
      <Button type="button" variant="outline" size="sm" disabled={images.length < 2} onClick={() => move(1)}>Siguiente</Button>
    </div>
    {images.length > 1 ? <div className="mt-3 grid grid-cols-5 gap-2" aria-label="Fotos del producto">{images.map((entry, position) =>
      <button key={`${entry.url}-${position}`} type="button" aria-label={`Ver imagen ${position + 1}`} aria-pressed={position === selectedIndex} onClick={() => setIndex(position)} className="relative aspect-square overflow-hidden rounded-md border border-border bg-white aria-pressed:border-primary focus-visible:ring-2 focus-visible:ring-ring">
        <PreviewPhoto image={{ ...entry, alt: "" }} sizes="120px" className="p-1" />
      </button>)}</div> : null}
  </div>;
}
