import { z } from "zod";

import {
  inventoryConditionValues,
  inventoryStatusValues,
} from "@/db/schema/enums";
import { importFieldValues } from "@/features/imports/domain/import-types";

export const importDefaultsSchema = z.object({
  condition: z.enum(inventoryConditionValues),
  inventoryStatus: z.enum(inventoryStatusValues),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/u),
  isPublic: z.boolean(),
});

export const importMappingSchema = z
  .partialRecord(z.enum(importFieldValues), z.string().trim().min(1).max(200));

export const importCorrectionSchema = z.object({
  brand: z.string().trim().max(120).optional(),
  componentType: z.string().trim().max(120).optional(),
  partNumber: z.string().trim().max(160).nullable().optional(),
  compatibleModel: z.string().trim().max(160).nullable().optional(),
  purchaseCost: z.string().trim().max(40).nullable().optional(),
  existingSku: z.string().trim().max(160).nullable().optional(),
  forceNew: z.boolean().optional(),
});

export const importCorrectionsSchema = z
  .record(z.string().regex(/^\d+$/u), importCorrectionSchema)
  .transform((value) =>
    Object.fromEntries(Object.entries(value).map(([row, correction]) => [Number(row), correction])),
  );

export const analyzeImportOptionsSchema = z.object({
  jobId: z.uuid().optional(),
  mapping: importMappingSchema.optional(),
  defaults: importDefaultsSchema,
  corrections: importCorrectionsSchema.default({}),
});

export const confirmImportOptionsSchema = analyzeImportOptionsSchema.extend({
  jobId: z.uuid(),
  forceDuplicateFile: z.boolean().default(false),
  includeDuplicateRows: z.boolean().default(false),
  includePreviouslyImported: z.boolean().default(false),
});
