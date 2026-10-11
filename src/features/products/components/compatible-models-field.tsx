"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { FieldError } from "@/components/forms/form-feedback";
import { AutocompleteInput } from "@/components/forms/autocomplete-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { CompatibleModelSearchResult } from "@/features/inventory/data/quick-add-queries";
import { normalizeModel } from "@/features/products/domain/product-normalization";
import { normalizeWhitespace } from "@/features/shared/domain/text-normalization";
import { modelFromQuery } from "@/features/products/domain/compatible-model";
import { addCompatibleModelInlineAction } from "@/features/products/server/compatible-model-actions";

export type CompatibilityValue = {
  brandId: string;
  model: string;
  notes?: string | null;
};

type BrandOption = { id: string; name: string };

function compatibilityKey(value: Pick<CompatibilityValue, "brandId" | "model">): string {
  return `${value.brandId}:${normalizeModel(value.model)}`;
}

export function CompatibleModelsField({
  idPrefix,
  brands,
  value,
  onChange,
  defaultBrandId,
  searchBrandId,
  onSearchBrandChange,
  errors,
  onBusyChange,
}: {
  idPrefix: string;
  brands: BrandOption[];
  value: CompatibilityValue[];
  onChange: (value: CompatibilityValue[]) => void;
  defaultBrandId: string;
  searchBrandId?: string | null;
  onSearchBrandChange?: (id: string) => void;
  errors?: string[];
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [brandOverride, setBrandOverride] = useState<string | null>(null);
  const selectedSearchBrand = searchBrandId ?? brandOverride ?? defaultBrandId;
  const brandId = brands.some((brand) => brand.id === selectedSearchBrand)
    ? selectedSearchBrand : brands[0]?.id ?? "";
  const setBrandId = (id: string) => { setBrandOverride(id); onSearchBrandChange?.(id); };
  const [saving, startTransition] = useTransition();
  const [modelMessage, setModelMessage] = useState("");
  useEffect(() => { onBusyChange?.(saving); }, [saving, onBusyChange]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompatibleModelSearchResult[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searchedBrandId, setSearchedBrandId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchedQuery("");
      setSearchError("");
      try {
        const selectedBrand = brands.find((brand) => brand.id === brandId);
        const searchTerm = selectedBrand
          ? modelFromQuery(trimmed, selectedBrand.name)
          : trimmed;
        const response = await fetch(
          `/api/admin/compatible-models/search?q=${encodeURIComponent(searchTerm)}&brandId=${encodeURIComponent(brandId)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const body = (await response.json()) as {
          results?: CompatibleModelSearchResult[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "No fue posible buscar modelos compatibles.");
        }
        if (controller.signal.aborted) return;
        setResults(body.results ?? []);
        setSearchedQuery(trimmed);
        setSearchedBrandId(brandId);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchError(
          error instanceof Error
            ? error.message
            : "No fue posible buscar modelos compatibles.",
        );
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [brandId, brands, query]);

  const selectedKeys = useMemo(
    () => new Set(value.map(compatibilityKey)),
    [value],
  );
  const availableResults = useMemo(
    () => (searchedQuery === query.trim() && searchedBrandId === brandId ? results : []).filter(
      (result) =>
        result.brandId === brandId &&
        !selectedKeys.has(compatibilityKey(result)),
    ),
    [brandId, results, selectedKeys, searchedQuery, searchedBrandId, query],
  );
  const selectedBrand = brands.find((brand) => brand.id === brandId);
  const candidateModel = selectedBrand ? modelFromQuery(query, selectedBrand.name) : "";
  const exactExisting = results.find(
    (result) =>
      result.brandId === brandId &&
      normalizeModel(result.model) === normalizeModel(candidateModel),
  );
  const canCreate = Boolean(
    selectedBrand &&
      normalizeModel(candidateModel) &&
      query.trim().length >= 2 &&
      searchedQuery === query.trim() &&
      searchedBrandId === brandId &&
      !searching &&
      !searchError && !saving &&
      !selectedKeys.has(compatibilityKey({ brandId, model: candidateModel })) &&
      !exactExisting,
  );

  const resetSearch = () => {
    setQuery("");
    setResults([]);
    setSearchedQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const selectCompatibility = (compatibility: CompatibilityValue) => {
    const key = compatibilityKey(compatibility);
    if (!selectedKeys.has(key)) onChange([...value, compatibility]);
    resetSearch();
  };

  const createCompatibility = () => {
    if (!selectedBrand || !candidateModel || saving) return;
    setSearchError("");
    setModelMessage("");
    startTransition(async () => {
      try {
        const body = new FormData();
        body.set("brandId", brandId);
        body.set("model", candidateModel);
        const result = await addCompatibleModelInlineAction(body);
        if (result.status !== "success" || !result.compatibility) {
          setSearchError(result.message ?? "No pudimos agregar el modelo.");
          return;
        }
        selectCompatibility(result.compatibility);
        setModelMessage(result.message ?? "Modelo agregado.");
      } catch {
        setSearchError("No pudimos agregar el modelo. Vuelve a intentarlo.");
      }
    });
  };


  return (
    <div>
      <Label htmlFor={`${idPrefix}-compatible-model-search`}>Modelos compatibles</Label>
      <p className="mt-1 text-small text-muted-foreground">
        Busca y agrega todos los modelos con los que funciona este producto.
      </p>

      {value.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Modelos compatibles seleccionados">
          {value.map((item) => {
            const brandName = brands.find((brand) => brand.id === item.brandId)?.name ?? "Marca";
            const label = `${brandName} ${item.model}`;
            return (
              <li
                key={compatibilityKey(item)}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3 py-1.5 text-small font-semibold text-primary-active"
              >
                <span className="truncate">{label}</span>
                <button
                  type="button"
                  className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Eliminar modelo compatible ${label}`}
                  disabled={saving}
                  onClick={() =>
                    onChange(value.filter((entry) => compatibilityKey(entry) !== compatibilityKey(item)))
                  }
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl bg-muted px-4 py-3 text-small text-muted-foreground">
          Sin modelos compatibles seleccionados.
        </p>
      )}

      <div className="relative mt-3 grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div>
          <Label htmlFor={`${idPrefix}-compatible-model-brand`} className="sr-only">
            Marca del modelo compatible
          </Label>
          <Select
            id={`${idPrefix}-compatible-model-brand`}
            value={brandId}
            onChange={(event) => {
              setBrandId(event.target.value);
              setSearchedQuery("");
            }}
            disabled={saving || brands.length === 0}
          >
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>{brand.name}</option>
            ))}
          </Select>
        </div>
        <AutocompleteInput id={`${idPrefix}-compatible-model-search`} inputRef={inputRef}
          label="Buscar modelo compatible" placeholder="Buscar modelo compatible…" query={query}
          disabled={saving} loading={searching || saving}
          onQueryChange={(nextQuery) => {
            setQuery(nextQuery); setSearchedQuery(""); setModelMessage(""); setSearchError("");
            const prefixedBrand = [...brands].sort((a, b) => b.name.length - a.name.length)
              .find((brand) => modelFromQuery(nextQuery, brand.name) !== normalizeWhitespace(nextQuery));
            if (prefixedBrand) setBrandId(prefixedBrand.id);
            if (nextQuery.trim().length < 2) { setResults([]); setSearching(false); }
          }}
          options={availableResults.map((result) => ({ id: compatibilityKey(result), label: `${result.brandName} ${result.model}` }))}
          onSelect={(id) => {
            const result = availableResults.find((entry) => compatibilityKey(entry) === id);
            if (result) selectCompatibility({ brandId: result.brandId, model: result.model, notes: null });
          }}
          createLabel={canCreate ? `+ Agregar modelo “${selectedBrand?.name} ${candidateModel}”` : undefined}
          onCreate={createCompatibility}
          emptyMessage={query.trim().length < 2 ? "Escribe al menos dos caracteres para buscar modelos."
            : searchedQuery === query.trim() && searchedBrandId === brandId
              ? selectedKeys.has(compatibilityKey({ brandId, model: candidateModel })) || results.some((result) => result.brandId === brandId)
                ? "Los modelos encontrados ya están seleccionados." : "No encontramos este modelo." : undefined}
        />
      </div>

      {searchError ? <p role="alert" className="mt-2 text-small text-danger">{searchError}</p> : null}
      {modelMessage ? <p role="status" className="mt-2 text-small text-success">{modelMessage}</p> : null}
      <FieldError errors={errors} />
    </div>
  );
}
