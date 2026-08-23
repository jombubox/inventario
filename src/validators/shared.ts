import { z } from "zod";

import { normalizeWhitespace } from "@/features/shared/domain/text-normalization";

export const requiredDisplayText = z
  .string()
  .transform(normalizeWhitespace)
  .pipe(z.string().min(1));

export const optionalDisplayText = z.preprocess(
  (value) => (typeof value === "string" && normalizeWhitespace(value) === "" ? null : value),
  z.string().transform(normalizeWhitespace).nullable().optional(),
);

export const moneyString = z
  .string()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/u, "Use a non-negative decimal with at most two places.");

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/u, "Currency must be an ISO-style three-letter code.");
