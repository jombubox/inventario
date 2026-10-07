"use client";

import { useRef } from "react";

import { FieldError } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_PRODUCT_SECONDARY_SERIALS } from "@/features/products/domain/serial-number";

export type SerialNumberValue = { id: string; value: string };

export function ProductSerialFields({
  idPrefix,
  primarySerialNumber,
  onPrimarySerialNumberChange,
  secondarySerialNumbers,
  onSecondarySerialNumbersChange,
  primaryErrors,
  secondaryErrors,
}: {
  idPrefix: string;
  primarySerialNumber: string;
  onPrimarySerialNumberChange: (value: string) => void;
  secondarySerialNumbers: SerialNumberValue[];
  onSecondarySerialNumbersChange: (values: SerialNumberValue[]) => void;
  primaryErrors?: string[];
  secondaryErrors?: string[];
}) {
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  const addSecondary = () => {
    if (secondarySerialNumbers.length >= MAX_PRODUCT_SECONDARY_SERIALS) return;
    const id = `new-${crypto.randomUUID()}`;
    onSecondarySerialNumbersChange([
      ...secondarySerialNumbers,
      { id, value: "" },
    ]);
    requestAnimationFrame(() => inputRefs.current.get(id)?.focus());
  };

  const removeSecondary = (index: number) => {
    const focusId =
      secondarySerialNumbers[index - 1]?.id ?? secondarySerialNumbers[index + 1]?.id;
    onSecondarySerialNumbersChange(
      secondarySerialNumbers.filter((_, itemIndex) => itemIndex !== index),
    );
    requestAnimationFrame(() => {
      if (focusId) inputRefs.current.get(focusId)?.focus();
      else document.getElementById(`${idPrefix}-add-secondary`)?.focus();
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor={`${idPrefix}-primary-serial`}>
          Número de serie principal <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          aria-invalid={Boolean(primaryErrors?.length)}
          id={`${idPrefix}-primary-serial`}
          value={primarySerialNumber}
          onChange={(event) => onPrimarySerialNumberChange(event.target.value)}
          placeholder="Ej. ABC-12345"
          className="mt-2"
          autoComplete="off"
        />
        <FieldError errors={primaryErrors} />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-label font-semibold text-foreground">
              Números de serie secundarios
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Identificadores alternos del mismo modelo; no representan unidades físicas.
            </p>
          </div>
          <Button
            id={`${idPrefix}-add-secondary`}
            type="button"
            variant="outline"
            size="sm"
            onClick={addSecondary}
            disabled={secondarySerialNumbers.length >= MAX_PRODUCT_SECONDARY_SERIALS}
          >
            + Agregar número de serie secundario
          </Button>
        </div>

        <div className="mt-3 space-y-3">
          {secondarySerialNumbers.map((serial, index) => (
            <div key={serial.id} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor={`${idPrefix}-secondary-serial-${serial.id}`} className="sr-only">
                  Número de serie secundario {index + 1}
                </Label>
                <Input
                  ref={(element) => {
                    if (element) inputRefs.current.set(serial.id, element);
                    else inputRefs.current.delete(serial.id);
                  }}
                  id={`${idPrefix}-secondary-serial-${serial.id}`}
                  aria-label={`Número de serie secundario ${index + 1}`}
                  aria-invalid={Boolean(secondaryErrors?.length)}
                  value={serial.value}
                  onChange={(event) =>
                    onSecondarySerialNumbersChange(
                      secondarySerialNumbers.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    )
                  }
                  placeholder="Ej. OEM-4412"
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-danger"
                aria-label={`Quitar número de serie secundario ${index + 1}`}
                onClick={() => removeSecondary(index)}
              >
                <span aria-hidden="true" className="text-xl">×</span>
              </Button>
            </div>
          ))}
        </div>
        <FieldError errors={secondaryErrors} />
      </div>
    </div>
  );
}
