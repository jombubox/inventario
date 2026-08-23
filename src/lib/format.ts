export function formatDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

export function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

export function formatMoney(value: string | null, currency = "MXN"): string {
  if (value === null) return "Sin precio";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(Number(value));
}
