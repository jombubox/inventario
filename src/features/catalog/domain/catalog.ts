export const LOW_STOCK_THRESHOLD = 2;

export const publicConditionValues = [
  "NEW",
  "USED_EXCELLENT",
  "USED_GOOD",
  "USED_FAIR",
  "FOR_PARTS",
  "UNKNOWN",
] as const;

export type PublicCondition = (typeof publicConditionValues)[number];

export const conditionLabels: Record<PublicCondition, string> = {
  NEW: "Nuevo",
  USED_EXCELLENT: "Usado · excelente",
  USED_GOOD: "Usado · bueno",
  USED_FAIR: "Usado · regular",
  FOR_PARTS: "Para refacciones",
  UNKNOWN: "Sin especificar",
};

export const availabilityValues = ["disponible", "pocas", "agotado"] as const;
export type AvailabilityFilter = (typeof availabilityValues)[number];

export type PublicAvailability = {
  key: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  label: "Disponible" | "Pocas piezas" | "Agotado";
};

export function getPublicAvailability(availableUnits: number): PublicAvailability {
  if (availableUnits <= 0) return { key: "OUT_OF_STOCK", label: "Agotado" };
  if (availableUnits <= LOW_STOCK_THRESHOLD) {
    return { key: "LOW_STOCK", label: "Pocas piezas" };
  }
  return { key: "IN_STOCK", label: "Disponible" };
}

export function formatPublicPrice(price: string | null, currency: string): string {
  if (price === null) return "Consultar precio";

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(price));
}

