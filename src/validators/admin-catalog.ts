import { z } from "zod";

import { requiredDisplayText } from "@/validators/shared";

const catalogName = requiredDisplayText.pipe(
  z.string().max(120, "El nombre debe tener 120 caracteres o menos."),
);

export const createCatalogEntryMutationSchema = z.object({
  name: catalogName,
});

export const updateCatalogEntryMutationSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
  name: catalogName,
});

export const archiveCatalogEntryMutationSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
});

export const catalogListQuerySchema = z.object({
  q: z.string().trim().max(100).catch("").default(""),
});

export type CreateCatalogEntryMutationInput = z.infer<
  typeof createCatalogEntryMutationSchema
>;
export type UpdateCatalogEntryMutationInput = z.infer<
  typeof updateCatalogEntryMutationSchema
>;
export type ArchiveCatalogEntryMutationInput = z.infer<
  typeof archiveCatalogEntryMutationSchema
>;
