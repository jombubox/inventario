export const quickAddSteps = [
  "Marca y tipo de pieza",
  "Identificación del producto",
  "Modelos compatibles",
  "Fotos del producto",
  "Inventario y publicación",
] as const;

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export function quickAddErrorStep(errors?: Record<string, string[] | undefined>, message = ""): WizardStep {
  const fields = Object.keys(errors ?? {});
  if (fields.some((field) => ["brandId", "componentTypeId", "customBrandName", "customComponentTypeName"].includes(field))) return 1;
  if (fields.some((field) => ["title", "partNumber", "primarySerialNumber", "secondarySerialNumbers"].includes(field))) return 2;
  if (fields.includes("compatibilities")) return 3;
  if (/modelos? compatibles?|compatibilidad/iu.test(message)) return 3;
  if (/marca|tipo de pieza/iu.test(message)) return 1;
  if (/identidad|número de parte|serie/iu.test(message)) return 2;
  return 5;
}
