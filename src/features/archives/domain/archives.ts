import { z } from "zod";

export const archiveCategories = [
  { key: "productos", label: "Productos", singular: "Producto", empty: "No hay productos archivados." },
  { key: "marcas", label: "Marcas", singular: "Marca", empty: "No hay marcas archivadas." },
  { key: "tipos", label: "Tipos de pieza", singular: "Tipo de pieza", empty: "No hay tipos de pieza archivados." },
  { key: "ubicaciones", label: "Ubicaciones", singular: "Ubicación", empty: "No hay ubicaciones archivadas." },
  { key: "cajas", label: "Cajas", singular: "Caja", empty: "No hay cajas archivadas." },
] as const;
export type ArchiveCategory = typeof archiveCategories[number]["key"];
export const archiveQuerySchema = z.object({
  categoria: z.enum(["productos", "marcas", "tipos", "ubicaciones", "cajas"]).catch("productos"),
  q: z.string().trim().max(100).catch(""),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
});
export const archiveMutationSchema = z.object({
  categoria: z.enum(["productos", "marcas", "tipos", "ubicaciones", "cajas"]),
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
});
