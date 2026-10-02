import "server-only";

import { revalidatePath } from "next/cache";
import { publicProductPath } from "@/features/products/domain/public-product";

export function revalidatePublicCatalog(productSlug?: string): void {
  revalidatePath("/");
  revalidatePath("/catalogo");
  if (productSlug) revalidatePath(publicProductPath(productSlug));
  else revalidatePath("/catalogo/[slug]", "page");
  revalidatePath("/sitemap.xml");
}
