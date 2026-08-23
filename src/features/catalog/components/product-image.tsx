import Image from "next/image";

import { cn } from "@/lib/cn";

type ProductImageProps = {
  image: { url: string; alt: string } | null;
  className?: string;
  sizes: string;
  preload?: boolean;
};

export function ProductImage({ image, className, sizes, preload = false }: ProductImageProps) {
  if (!image) {
    return <ProductImagePlaceholder className={className} />;
  }

  return (
    <div className={cn("relative overflow-hidden bg-white", className)}>
      <Image
        src={image.url}
        alt={image.alt}
        fill
        sizes={sizes}
        preload={preload}
        className="object-contain p-5 transition-transform duration-300 group-hover:scale-[1.025]"
      />
    </div>
  );
}

export function ProductImagePlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid place-items-center overflow-hidden bg-[linear-gradient(145deg,var(--muted),var(--card))] text-muted-foreground",
        className,
      )}
      aria-label="Producto sin imagen"
      role="img"
    >
      <svg viewBox="0 0 96 96" className="h-20 w-20 opacity-55" aria-hidden="true">
        <path
          d="M19 32.5 48 16l29 16.5v32.8L48 82 19 65.3V32.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="m20 33 28 16 28-16M48 49v32" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="m34 25 29 16.5v12" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
    </div>
  );
}
