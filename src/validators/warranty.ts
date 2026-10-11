import { z } from "zod";
import { WARRANTY_MONTH_DIGITS, WARRANTY_TEXT_LIMIT } from "@/features/products/domain/warranty";
import { optionalDisplayText } from "@/validators/shared";

const monthsWarranty = z.object({ months: z.string(), noWarranty: z.boolean() })
  .superRefine((value, context) => {
    if (value.noWarranty || value.months === "") return;
    if (!/^\d+$/u.test(value.months) || !/[1-9]/u.test(value.months)) {
      context.addIssue({ code: "custom", message: "Escribe un número entero de meses mayor que cero." });
    } else if (value.months.replace(/^0+/u, "").length > WARRANTY_MONTH_DIGITS) {
      context.addIssue({ code: "custom", message: "La garantía debe tener 240 caracteres o menos." });
    }
  }).transform(({ months, noWarranty }) => noWarranty ? "Sin garantía" : months ? `${months.replace(/^0+/u, "")} meses` : null);

// Legacy text remains accepted for existing records and internal import callers.
export const warrantyMutationSchema = z.union([
  monthsWarranty,
  optionalDisplayText.pipe(z.string().max(WARRANTY_TEXT_LIMIT, "La garantía debe tener 240 caracteres o menos.").nullable().optional()),
], { error: "Escribe un número entero de meses mayor que cero." });
