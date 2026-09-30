"use client";

import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { FieldError } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { CompatibleModelSearchResult } from "@/features/inventory/data/quick-add-queries";
import { normalizeModel } from "@/features/products/domain/product-normalization";
import { normalizeWhitespace } from "@/features/shared/domain/text-normalization";

export type CompatibilityValue = {
  brandId: string;
  model: string;
  notes?: string | null;
};

type BrandOption = { id: string; name: string };

function compatibilityKey(value: Pick<CompatibilityValue, "brandId" | "model">): string {
  return `${value.brandId}:${normalizeModel(value.model)}`;
}

function modelFromQuery(query: string, brandName: string): string {
  const cleaned = normalizeWhitespace(query);
  const prefix = `${normalizeWhitespace(brandName)} `;
  return cleaned.toLocaleUpperCase("es-MX").startsWith(prefix.toLocaleUpperCase("es-MX"))
    ? cleaned.slice(prefix.length).trim()
    : cleaned;
}

export function CompatibleModelsField({
  idPrefix,
  brands,
  value,
  onChange,
  defaultBrandId,
  errors,
}: {
  idPrefix: string;
  brands: BrandOption[];
  value: CompatibilityValue[];
  onChange: (value: CompatibilityValue[]) => void;
  defaultBrandId: string;
  errors?: string[];
}) {
  const generatedId = useId();
  const listboxId = `${idPrefix}-${generatedId.replaceAll(":", "")}-results`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [brandId, setBrandId] = useState(
    brands.some((brand) => brand.id === defaultBrandId)
      ? defaultBrandId
      : brands[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompatibleModelSearchResult[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

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
          `/api/admin/compatible-models/search?q=${encodeURIComponent(searchTerm)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const body = (await response.json()) as {
          results?: CompatibleModelSearchResult[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "No fue posible buscar modelos compatibles.");
        }
        setResults(body.results ?? []);
        setSearchedQuery(trimmed);
        setExpanded(true);
        setActiveIndex(0);
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
    () => results.filter(
      (result) =>
        result.brandId === brandId &&
        !selectedKeys.has(compatibilityKey(result)),
    ),
    [brandId, results, selectedKeys],
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
      candidateModel &&
      query.trim().length >= 2 &&
      searchedQuery === query.trim() &&
      !searching &&
      !selectedKeys.has(compatibilityKey({ brandId, model: candidateModel })) &&
      !exactExisting,
  );

  const resetSearch = () => {
    setQuery("");
    setResults([]);
    setSearchedQuery("");
    setExpanded(false);
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const selectCompatibility = (compatibility: CompatibilityValue) => {
    const key = compatibilityKey(compatibility);
    if (!selectedKeys.has(key)) onChange([...value, compatibility]);
    resetSearch();
  };

  const createCompatibility = () => {
    if (!selectedBrand || !candidateModel) return;
    if (exactExisting) {
      selectCompatibility({
        brandId: exactExisting.brandId,
        model: exactExisting.model,
        notes: null,
      });
      return;
    }
    selectCompatibility({ brandId, model: candidateModel, notes: null });
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setExpanded(false);
      return;
    }
    const optionCount = availableResults.length + (canCreate ? 1 : 0);
    if (optionCount === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setExpanded(true);
      setActiveIndex((index) => (index + 1) % optionCount);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setExpanded(true);
      setActiveIndex((index) => (index - 1 + optionCount) % optionCount);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = availableResults[activeIndex];
      if (result) {
        selectCompatibility({
          brandId: result.brandId,
          model: result.model,
          notes: null,
        });
      } else if (canCreate) {
        createCompatibility();
      }
    }
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
              setActiveIndex(0);
            }}
            disabled={brands.length === 0}
          >
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>{brand.name}</option>
            ))}
          </Select>
        </div>
        <div className="relative">
          <Label htmlFor={`${idPrefix}-compatible-model-search`} className="sr-only">
            Buscar modelo compatible
          </Label>
          <Input
            ref={inputRef}
            id={`${idPrefix}-compatible-model-search`}
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              const shouldSearch = nextQuery.trim().length >= 2;
              setExpanded(shouldSearch);
              if (!shouldSearch) {
                setResults([]);
                setSearchedQuery("");
                setSearching(false);
                setSearchError("");
              }
              setActiveIndex(0);
            }}
            onFocus={() => setExpanded(query.trim().length >= 2)}
            onKeyDown={onSearchKeyDown}
            placeholder="Buscar modelo compatible…"
            autoComplete="off"
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              expanded
                ? activeIndex < availableResults.length
                  ? `${listboxId}-${activeIndex}`
                  : canCreate
                    ? `${listboxId}-create`
                    : undefined
                : undefined
            }
            className="pr-10"
          />
          {searching ? <Spinner className="absolute right-3 top-3.5 text-primary" /> : null}
        </div>

        {expanded && query.trim().length >= 2 ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Resultados de modelos compatibles"
            className="z-20 max-h-64 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-lg sm:col-start-2"
          >
            {availableResults.map((result, index) => (
              <button
                key={compatibilityKey(result)}
                id={`${listboxId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-small hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-primary-soft"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  selectCompatibility({
                    brandId: result.brandId,
                    model: result.model,
                    notes: null,
                  })
                }
              >
                <span><strong>{result.brandName}</strong> {result.model}</span>
                <span className="text-primary">Agregar</span>
              </button>
            ))}

            {searchedQuery && !searching && availableResults.length === 0 ? (
              <p className="px-3 py-2 text-small text-muted-foreground">
                {results.some((result) => result.brandId === brandId)
                  ? "Los modelos encontrados ya están seleccionados."
                  : "No encontramos este modelo."}
              </p>
            ) : null}

            {canCreate ? (
              <Button
                id={`${listboxId}-create`}
                type="button"
                variant="ghost"
                size="sm"
                role="option"
                aria-selected={activeIndex === availableResults.length}
                className="mt-1 w-full justify-start"
                onMouseDown={(event) => event.preventDefault()}
                onClick={createCompatibility}
              >
                + Agregar “{normalizeWhitespace(query)}”
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {searchError ? <p role="alert" className="mt-2 text-small text-danger">{searchError}</p> : null}
      <FieldError errors={errors} />
    </div>
  );
}
