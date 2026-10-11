"use client";

import { FieldError } from "@/components/forms/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WARRANTY_MONTH_DIGITS, type WarrantyDraft, warrantySubmission } from "@/features/products/domain/warranty";

export function WarrantySubmission({ value }: { value: WarrantyDraft }) {
  // An untouched historical text value is omitted on edit so the stored bytes stay intact.
  if (value.legacy !== null) return null;
  return <input type="hidden" name="warrantyInput" value={JSON.stringify(warrantySubmission(value))} />;
}

export function WarrantyField({ id, value, onChange, errors, submit = true }: {
  id: string; value: WarrantyDraft; onChange: (value: WarrantyDraft) => void; errors?: string[]; submit?: boolean;
}) {
  return <div>
    {submit ? <WarrantySubmission value={value} /> : null}
    <Label htmlFor={id}>Garantía</Label>
    {value.legacy !== null ? <div className="mt-2 rounded-md bg-muted p-3 text-small">
      <p className="break-words">Garantía registrada: {value.legacy}</p>
      <button type="button" className="mt-2 min-h-11 font-semibold text-link" onClick={() => onChange({ ...value, legacy: null })}>Cambiar garantía</button>
    </div> : <>
      <div className="mt-2 flex items-center gap-3">
        <Input id={id} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={WARRANTY_MONTH_DIGITS}
          value={value.months} disabled={value.noWarranty} aria-invalid={Boolean(errors?.length)} aria-describedby={`${id}-help`}
          onChange={(event) => onChange({ ...value, months: event.target.value })} className="min-w-0" />
        <span className="text-small text-muted-foreground">meses</span>
      </div>
      <label className="mt-2 flex min-h-11 items-center gap-3 text-small">
        <input type="checkbox" checked={value.noWarranty} onChange={(event) => onChange({ ...value, noWarranty: event.target.checked })} className="size-4 accent-primary" /> Sin garantía
      </label>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">{value.noWarranty ? "Este producto no tiene garantía." : "Opcional. Deja el campo vacío si no está especificada."}</p>
    </>}
    <FieldError errors={errors} />
  </div>;
}
