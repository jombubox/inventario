import { z } from "zod";

import {
  availabilityValues,
  publicConditionValues,
} from "@/features/catalog/domain/catalog";

export const catalogSortValues = [
  "recientes",
  "nombre-asc",
  "nombre-desc",
  "precio-asc",
  "precio-desc",
] as const;

export type CatalogSort = (typeof catalogSortValues)[number];

export type CatalogSearchParams = {
  q?: string;
  marca?: string;
  tipo?: string;
  modelo?: string;
  condicion?: (typeof publicConditionValues)[number];
  disponibilidad?: (typeof availabilityValues)[number];
  precioMin?: number;
  precioMax?: number;
  sort: CatalogSort;
  page: number;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const shortText = z.string().trim().max(120).catch("");
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  .max(100)
  .catch("");
const price = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().finite().min(0).max(100_000_000).optional().catch(undefined),
);

export function parseCatalogSearchParams(raw: RawSearchParams): CatalogSearchParams {
  const q = shortText.parse(firstValue(raw.q) ?? "");
  const marca = slug.parse(firstValue(raw.marca) ?? "");
  const tipo = slug.parse(firstValue(raw.tipo) ?? "");
  const modelo = shortText.parse(firstValue(raw.modelo) ?? "");
  const condicion = z
    .enum(publicConditionValues)
    .optional()
    .catch(undefined)
    .parse(firstValue(raw.condicion));
  const disponibilidad = z
    .enum(availabilityValues)
    .optional()
    .catch(undefined)
    .parse(firstValue(raw.disponibilidad));
  let precioMin = price.parse(firstValue(raw.precioMin));
  let precioMax = price.parse(firstValue(raw.precioMax));
  const sort = z
    .enum(catalogSortValues)
    .catch("recientes")
    .parse(firstValue(raw.sort));
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .catch(1)
    .parse(firstValue(raw.page) ?? 1);

  if (precioMin !== undefined && precioMax !== undefined && precioMin > precioMax) {
    [precioMin, precioMax] = [precioMax, precioMin];
  }

  return {
    ...(q ? { q } : {}),
    ...(marca ? { marca } : {}),
    ...(tipo ? { tipo } : {}),
    ...(modelo ? { modelo } : {}),
    ...(condicion ? { condicion } : {}),
    ...(disponibilidad ? { disponibilidad } : {}),
    ...(precioMin !== undefined ? { precioMin } : {}),
    ...(precioMax !== undefined ? { precioMax } : {}),
    sort,
    page,
  };
}

export function catalogFilterCount(query: CatalogSearchParams): number {
  return [
    query.marca,
    query.tipo,
    query.modelo,
    query.condicion,
    query.disponibilidad,
    query.precioMin,
    query.precioMax,
  ].filter((value) => value !== undefined && value !== "").length;
}

export function catalogQueryRecord(
  query: CatalogSearchParams,
  overrides: Partial<Record<keyof CatalogSearchParams, string | number | undefined>> = {},
): Record<string, string> {
  const merged = { ...query, ...overrides };
  const result: Record<string, string> = {};

  for (const key of [
    "q",
    "marca",
    "tipo",
    "modelo",
    "condicion",
    "disponibilidad",
    "precioMin",
    "precioMax",
    "sort",
    "page",
  ] as const) {
    const value = merged[key];
    if (value === undefined || value === "" || (key === "page" && value === 1)) continue;
    if (key === "sort" && value === "recientes") continue;
    result[key] = String(value);
  }

  return result;
}
