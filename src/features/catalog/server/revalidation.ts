import "server-only";

import { revalidatePath } from "next/cache";

export function revalidatePublicCatalog(productSlug?: string): void {
  revalidatePath("/");
  revalidatePath("/catalogo");
  if (productSlug) revalidatePath(`/catalogo/${productSlug}`);
  else revalidatePath("/catalogo/[slug]", "page");
  revalidatePath("/sitemap.xml");
}

