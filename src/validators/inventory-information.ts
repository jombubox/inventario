import { z } from "zod";
import { optionalDisplayText } from "@/validators/shared";

// Calendar dates are validated before adapting to the existing Drizzle DATE mapper.
// UTC is used only at that boundary; no local-time parsing or timestamp defaults.
export const optionalAcquisitionDate = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.union([z.iso.date().refine((value) => !value.startsWith("0000")), z.date()], { error: "Selecciona una fecha de adquisición válida (AAAA-MM-DD)." }).nullable(),
).transform((value) => typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : value);

export const MAX_INVENTORY_NOTES_LENGTH = 5000;
export const inventoryInformationFields = {
  acquiredAt: optionalAcquisitionDate,
  acquisitionSource: optionalDisplayText.pipe(z.string().max(500, "El origen admite hasta 500 caracteres.").nullish()),
  notes: z.preprocess(
    (value) => typeof value === "string" ? value.replace(/\r\n?/gu, "\n").trim() || null : value ?? null,
    z.string().max(MAX_INVENTORY_NOTES_LENGTH, "Las notas admiten hasta 5000 caracteres.").nullable(),
  ),
};
