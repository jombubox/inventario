import "server-only";

import { cache } from "react";

import { getDb } from "@/db";
import {
  getPublicProductBySlug,
  getRelatedProducts,
} from "@/features/catalog/data/public-catalog-queries";

export const loadPublicProductBySlug = cache((slug: string) =>
  getPublicProductBySlug(getDb(), slug),
);

export const loadRelatedProducts = cache(async (slug: string) => {
  const product = await loadPublicProductBySlug(slug);
  return product ? getRelatedProducts(getDb(), product) : [];
});

