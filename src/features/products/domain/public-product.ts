/** The public catalog and product service require ACTIVE + public + not deleted. */
export function isProductPublic(product: {
  status: string;
  isPublic: boolean;
  deletedAt?: Date | string | null;
}): boolean {
  return product.status === "ACTIVE" && product.isPublic && !product.deletedAt;
}

export function publicProductPath(slug: string): string {
  return `/catalogo/${encodeURIComponent(slug)}`;
}

export function productPublicationPath(product: {
  slug: string;
  status: string;
  isPublic: boolean;
  deletedAt?: Date | string | null;
}): string | null {
  return isProductPublic(product) ? publicProductPath(product.slug) : null;
}
