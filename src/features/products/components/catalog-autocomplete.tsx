"use client";

import { useEffect, useState, useTransition } from "react";
import { AutocompleteInput } from "@/components/forms/autocomplete-input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/forms/form-feedback";
import { createBrandInlineAction, createComponentTypeInlineAction } from "@/features/products/server/catalog-actions";
import { normalizeComparableText, normalizeWhitespace } from "@/features/shared/domain/text-normalization";

type CatalogOption = { id: string; name: string; code: string };
export function CatalogAutocomplete({ kind, options, value, onChange, onCreated, errors, onBusyChange }: {
  kind: "brand" | "componentType"; options: CatalogOption[]; value: string; onChange: (id: string) => void;
  onCreated: (entry: CatalogOption) => void; errors?: string[]; onBusyChange: (busy: boolean) => void;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, startTransition] = useTransition();
  useEffect(() => { onBusyChange(saving); }, [saving, onBusyChange]);
  const isBrand = kind === "brand";
  const noun = isBrand ? "marca" : "tipo de pieza";
  const selected = options.find((entry) => entry.id === value);
  const text = query ?? selected?.name ?? "";
  const normalized = normalizeComparableText(text);
  const unique = Array.from(new Map(options.map((entry) => [normalizeComparableText(entry.name), entry])).values());
  const results = unique.filter((entry) => normalizeComparableText(`${entry.name} ${entry.code}`).includes(normalized)).slice(0, 20);
  const canCreate = Boolean(normalized && !unique.some((entry) => normalizeComparableText(entry.name) === normalized));
  const select = (id: string) => { onChange(id); setQuery(null); setError(""); };
  const create = () => {
    if (!canCreate || saving) return;
    setError(""); setMessage("");
    startTransition(async () => {
      try {
        const body = new FormData(); body.set("name", normalizeWhitespace(text));
        const result = await (isBrand ? createBrandInlineAction(body) : createComponentTypeInlineAction(body));
        if (result.status !== "success" || !result.entry) { setError(result.fieldErrors?.name?.[0] ?? result.message ?? "No pudimos guardar el registro."); return; }
        onCreated(result.entry); select(result.entry.id); setMessage(result.message ?? "Guardado.");
      } catch { setError("No pudimos guardar el registro. Vuelve a intentarlo."); }
    });
  };
  return <div className="min-w-0">
    <Label htmlFor={`quick-${kind}`}>{isBrand ? "Marca" : "Tipo de pieza"}</Label>
    <div className="mt-2"><AutocompleteInput id={`quick-${kind}`} label={isBrand ? "Buscar marca" : "Buscar tipo de pieza"} placeholder={`Buscar ${noun}…`}
      query={text} onQueryChange={(next) => { setQuery(next); onChange(""); setMessage(""); setError(""); }}
      options={results.map((entry) => ({ id: entry.id, label: entry.name }))} onSelect={select}
      createLabel={canCreate ? `+ Agregar ${noun} "${normalizeWhitespace(text)}"` : undefined} onCreate={create}
      emptyMessage={isBrand ? "No encontramos esta marca." : "No encontramos este tipo de pieza."} loading={saving} disabled={saving} invalid={Boolean(errors?.length)} /></div>
    {selected ? <button type="button" disabled={saving} onClick={() => { onChange(""); setQuery(""); }} className="mt-1 min-h-11 text-small font-semibold text-link">Quitar {noun}</button> : null}
    <FieldError errors={errors} />
    {error ? <p role="alert" className="mt-2 text-small text-danger">{error}</p> : null}
    {message ? <p role="status" className="mt-2 text-small text-success">{message}</p> : null}
  </div>;
}
