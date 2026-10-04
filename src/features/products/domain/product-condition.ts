export const productConditionValues = ["NEW", "USED"] as const;
export type ProductCondition = (typeof productConditionValues)[number];

export const productConditionLabels: Record<ProductCondition, string> = {
  NEW: "Nuevo",
  USED: "Usado",
};

export function formatProductCondition(condition: ProductCondition | null | undefined) {
  return condition ? productConditionLabels[condition] : "Sin especificar";
}
