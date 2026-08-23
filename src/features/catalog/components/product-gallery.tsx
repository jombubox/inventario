"use client";

import Image from "next/image";
import { useState } from "react";

import { ProductImagePlaceholder } from "@/features/catalog/components/product-image";
import type { PublicProductImageDTO } from "@/features/catalog/data/public-catalog-queries";
import { cn } from "@/lib/cn";

export function ProductGallery({
  images,
  title,
}: {
  images: PublicProductImageDTO[];
  title: string;
}) {
  const supported = images;
  const [selectedUrl, setSelectedUrl] = useState(supported[0]?.url ?? null);
  const selected = supported.find(({ url }) => url === selectedUrl) ?? supported[0] ?? null;

  if (!selected) {
    return <ProductImagePlaceholder className="aspect-square w-full rounded-2xl border border-border" />;
  }

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-white">
        <Image
          key={selected.url}
          src={selected.url}
          alt={selected.alt || title}
          fill
          sizes="(max-width: 1023px) 100vw, 50vw"
          preload
          className="object-contain p-5 sm:p-8"
        />
      </div>
      {supported.length > 1 ? (
        <div className="mt-3 grid grid-cols-5 gap-2" role="list" aria-label="Imágenes del producto">
          {supported.map((image, index) => {
            const active = image.url === selected.url;
            return (
              <button
                key={image.url}
                type="button"
                className={cn(
                  "relative aspect-square overflow-hidden rounded-xl border bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary ring-1 ring-primary" : "border-border hover:border-input",
                )}
                onClick={() => setSelectedUrl(image.url)}
                aria-label={`Ver imagen ${index + 1} de ${supported.length}`}
                aria-pressed={active}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-contain p-2"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
