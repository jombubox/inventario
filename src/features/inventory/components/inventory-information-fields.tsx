"use client";

import { FieldError } from "@/components/forms/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_INVENTORY_NOTES_LENGTH } from "@/validators/inventory-information";

export type InventoryInformation = { acquisitionSource: string; acquiredAt: string; notes: string };

export function InventoryInformationFields({ id, value, onChange, errors, submit = true }: {
  id: string;
  value: InventoryInformation;
  onChange: (value: InventoryInformation) => void;
  errors?: Record<string, string[] | undefined>;
  submit?: boolean;
}) {
  return <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
    <legend className="mb-3 font-semibold text-navy">Información adicional</legend>
    <p className="text-small text-muted-foreground sm:col-span-2">Opcional. Describe estas existencias, su origen y adquisición; cada registro de inventario conserva sus propios datos.</p>
    <div>
      <Label htmlFor={`${id}-source`}>Origen</Label>
      <Input id={`${id}-source`} name={submit ? "acquisitionSource" : undefined} maxLength={500} value={value.acquisitionSource} onChange={(event) => onChange({ ...value, acquisitionSource: event.target.value })} placeholder="Escribe el origen del producto" className="mt-2" aria-invalid={Boolean(errors?.acquisitionSource?.length)} />
      <FieldError errors={errors?.acquisitionSource} />
    </div>
    <div>
      <Label htmlFor={`${id}-date`}>Fecha</Label>
      <Input id={`${id}-date`} name={submit ? "acquiredAt" : undefined} type="date" value={value.acquiredAt} onChange={(event) => onChange({ ...value, acquiredAt: event.target.value })} className="mt-2" aria-describedby={`${id}-date-help`} aria-invalid={Boolean(errors?.acquiredAt?.length)} />
      <p id={`${id}-date-help`} className="mt-1 text-xs text-muted-foreground">Fecha de adquisición de estas existencias. No es la fecha de publicación.</p>
      <FieldError errors={errors?.acquiredAt} />
    </div>
    <div className="sm:col-span-2">
      <Label htmlFor={`${id}-notes`}>Notas</Label>
      <Textarea id={`${id}-notes`} name={submit ? "notes" : undefined} value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} rows={3} maxLength={MAX_INVENTORY_NOTES_LENGTH} placeholder="Agrega información adicional..." className="mt-2" aria-invalid={Boolean(errors?.notes?.length)} />
      <FieldError errors={errors?.notes} />
    </div>
  </fieldset>;
}
