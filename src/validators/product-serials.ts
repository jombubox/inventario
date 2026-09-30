import { z } from "zod";

import {
  cleanSerialNumber,
  findDuplicateSerialNumber,
  MAX_PRODUCT_SECONDARY_SERIALS,
  MAX_PRODUCT_SERIAL_LENGTH,
} from "@/features/products/domain/serial-number";

const optionalSerialNumber = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    return cleanSerialNumber(value) || null;
  },
  z
    .string()
    .max(
      MAX_PRODUCT_SERIAL_LENGTH,
      `El número de serie debe tener ${MAX_PRODUCT_SERIAL_LENGTH} caracteres o menos.`,
    )
    .nullable(),
);

const secondarySerialNumbers = z
  .array(optionalSerialNumber)
  .max(
    MAX_PRODUCT_SECONDARY_SERIALS,
    `Puedes registrar hasta ${MAX_PRODUCT_SECONDARY_SERIALS} números de serie secundarios.`,
  )
  .transform((serials) => serials.filter((serial): serial is string => serial !== null));

export const productSerialFields = {
  primarySerialNumber: optionalSerialNumber.optional(),
  secondarySerialNumbers: secondarySerialNumbers.optional(),
};

export function validateProductSerialFields(
  value: {
    primarySerialNumber?: string | null;
    secondarySerialNumbers?: string[];
  },
  context: z.RefinementCtx,
) {
  const secondary = value.secondarySerialNumbers ?? [];
  const duplicate = findDuplicateSerialNumber(value.primarySerialNumber, secondary);
  if (!duplicate) return;

  context.addIssue({
    code: "custom",
    path: ["secondarySerialNumbers"],
    message: `El número de serie ${duplicate} está repetido dentro de este producto.`,
  });
}
