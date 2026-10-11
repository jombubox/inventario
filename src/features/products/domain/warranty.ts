export const WARRANTY_TEXT_LIMIT = 240;
// The existing text column allows 240 characters, including the suffix. No business months cap exists.
export const WARRANTY_MONTH_DIGITS = WARRANTY_TEXT_LIMIT - " meses".length;
export type WarrantyDraft = { months: string; noWarranty: boolean; legacy: string | null };

export function warrantyDraft(value?: string | null): WarrantyDraft {
  if (!value) return { months: "", noWarranty: false, legacy: null };
  if (value === "Sin garantía") return { months: "", noWarranty: true, legacy: null };
  const match = /^([1-9]\d*) meses$/u.exec(value);
  return match?.[1] ? { months: match[1], noWarranty: false, legacy: null }
    : { months: "", noWarranty: false, legacy: value };
}

export function warrantySubmission(value: WarrantyDraft) {
  return value.legacy ?? { months: value.noWarranty ? "" : value.months, noWarranty: value.noWarranty };
}

export function readWarrantySubmission(formData: FormData): unknown {
  const input = formData.get("warrantyInput");
  if (input === null) return formData.get("warranty") ?? undefined;
  try { return JSON.parse(String(input)); } catch { return {}; }
}
