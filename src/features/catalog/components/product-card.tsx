import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { AvailabilityBadge } from "@/features/catalog/components/availability-badge";
import { ProductImage } from "@/features/catalog/components/product-image";
import {
  formatPublicPrice,
  conditionLabels,
} from "@/features/catalog/domain/catalog";
import type { PublicProductCardDTO } from "@/features/catalog/data/public-catalog-queries";

export function ProductCard({ product }: { product: PublicProductCardDTO }) {
  const extraModels = Math.max(product.compatibilityCount - 1, 0);

  return (
    <Link
      href={`/catalogo/${product.slug}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,15,48,0.03)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_12px_30px_rgba(0,15,48,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <ProductImage
        image={product.primaryImage}
        className="aspect-[4/3] w-full border-b border-border"
        sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw"
      />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge>{product.componentType.name}</Badge>
          <AvailabilityBadge availability={product.availability} />
        </div>
        <h2 className="mt-4 line-clamp-2 text-lg font-semibold leading-snug tracking-[-0.02em] text-navy group-hover:text-primary-active">
          {product.title}
        </h2>
        <p className="mt-2 text-small text-muted-foreground">
          {product.brand.name}
          {product.partNumber ? ` · ${product.partNumber}` : ""}
        </p>
        {product.compatibilityPreview ? (
          <p className="mt-2 line-clamp-1 text-small text-muted-foreground">
            {product.compatibilityPreview.brand} {product.compatibilityPreview.model}
            {extraModels > 0 ? ` +${extraModels}` : ""}
          </p>
        ) : (
          <p className="mt-2 text-small text-muted-foreground">Compatibilidad no especificada</p>
        )}
        {product.conditions.length > 0 ? (
          <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
            {product.conditions.map((condition) => conditionLabels[condition]).join(" · ")}
          </p>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <p className="font-mono text-xs font-semibold tracking-wide text-muted-foreground">
              {product.sku}
            </p>
            <p className="mt-1 text-base font-semibold text-navy">
              {formatPublicPrice(product.salePrice, product.currency)}
            </p>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-active transition-colors group-hover:bg-primary group-hover:text-white" aria-hidden="true">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
