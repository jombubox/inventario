"use client";

import { FieldError } from "@/components/forms/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CUSTOM_CATALOG_VALUE } from "@/features/products/domain/catalog-selection";

type CatalogOption = { id: string; name: string; code: string };

export function CreatableCatalogSelect({
  id,
  name,
  label,
  options,
  value,
  onChange,
  customName,
  onCustomNameChange,
  customFieldName,
  customLabel,
  addLabel,
  disabled = false,
  selectionErrors,
  customErrors,
}: {
  id: string;
  name: string;
  label: string;
  options: CatalogOption[];
  value: string;
  onChange: (value: string) => void;
  customName: string;
  onCustomNameChange: (value: string) => void;
  customFieldName: string;
  customLabel: string;
  addLabel: string;
  disabled?: boolean;
  selectionErrors?: string[];
  customErrors?: string[];
}) {
  const customInputId = `${id}-custom`;
  const selectionErrorId = `${id}-error`;
  const customErrorId = `${customInputId}-error`;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required
        aria-invalid={Boolean(selectionErrors?.length)}
        aria-describedby={selectionErrors?.length ? selectionErrorId : undefined}
        className="mt-2"
      >
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {item.code}
          </option>
        ))}
        <option value={CUSTOM_CATALOG_VALUE}>{addLabel}</option>
      </Select>
      <FieldError errors={selectionErrors} id={selectionErrorId} />
      {value === CUSTOM_CATALOG_VALUE ? (
        <div className="mt-3 rounded-md bg-primary-soft/50 p-3">
          <Label htmlFor={customInputId}>{customLabel}</Label>
          <Input
            id={customInputId}
            name={customFieldName}
            value={customName}
            onChange={(event) => onCustomNameChange(event.target.value)}
            disabled={disabled}
            maxLength={120}
            autoComplete="off"
            autoFocus
            required
            aria-invalid={Boolean(customErrors?.length)}
            aria-describedby={customErrors?.length ? customErrorId : undefined}
            className="mt-2 bg-background"
          />
          <FieldError errors={customErrors} id={customErrorId} />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Si ya existe con otra combinación de mayúsculas o espacios, se reutilizará.
          </p>
        </div>
      ) : null}
    </div>
  );
}
