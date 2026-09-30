"use client";

import {
  createContext,
  type ReactNode,
  useActionState,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { FieldError, FormFeedback } from "@/components/forms/form-feedback";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { UNPARENTED_BOXES_LOCATION_ID } from "@/features/locations/domain/quick-add-location";
import { CUSTOM_CATALOG_VALUE } from "@/features/products/domain/catalog-selection";
import {
  CompatibleModelsField,
  type CompatibilityValue,
} from "@/features/products/components/compatible-models-field";
import {
  ProductSerialFields,
  type SerialNumberValue,
} from "@/features/products/components/product-serial-fields";
import { findDuplicateSerialNumber } from "@/features/products/domain/serial-number";
import type { QuickAddProductResult } from "@/features/inventory/data/quick-add-queries";
import { quickAddInventoryAction } from "@/features/inventory/server/actions";
import { initialMutationState } from "@/features/shared/domain/mutation-state";
import { cn } from "@/lib/cn";

type CatalogOption = { id: string; name: string; code: string };
type LocationOption = {
  id: string;
  code: string;
  name: string;
  breadcrumb: string;
  kind: "container" | "unparented-boxes";
};
type BoxOption = {
  id: string;
  code: string;
  name: string;
  parentId: string;
  breadcrumb: string;
};

type QuickAddOptions = {
  brands: CatalogOption[];
  componentTypes: CatalogOption[];
  locations: LocationOption[];
  boxes: BoxOption[];
  locationAvailability: {
    total: number;
    active: number;
    inactive: number;
    unparentedBoxes: number;
  };
};

const QuickAddContext = createContext<((trigger?: HTMLElement) => void) | null>(null);

function useOpenQuickAdd() {
  const open = useContext(QuickAddContext);
  if (!open) throw new Error("AdminQuickAddButton must be inside AdminQuickAddProvider.");
  return open;
}

export function AdminQuickAddButton({
  children = "Agregar producto",
  className,
  compact = false,
}: {
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const open = useOpenQuickAdd();
  return (
    <button
      data-quick-add-trigger
      type="button"
      onClick={(event) => open(event.currentTarget)}
      className={cn(
        buttonStyles({ size: compact ? "sm" : "md" }),
        "w-full justify-start",
        className,
      )}
    >
      <span aria-hidden="true" className="text-lg leading-none">+</span>
      {children}
    </button>
  );
}

export function AdminQuickAddProvider({
  options,
  children,
}: {
  options: QuickAddOptions;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [latestOptions, setLatestOptions] = useState(options);
  const triggerRef = useRef<HTMLElement | null>(null);

  const openQuickAdd = (trigger?: HTMLElement) => {
    triggerRef.current = trigger ?? null;
    setOpen(true);
    void fetch("/api/admin/quick-add/options", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { options?: QuickAddOptions };
        if (body.options) setLatestOptions(body.options);
      })
      .catch(() => undefined);
  };

  const close = () => {
    setOpen(false);
    setSession((value) => value + 1);
    const trigger = triggerRef.current;
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  };

  return (
    <QuickAddContext.Provider value={openQuickAdd}>
      {children}
      {open ? (
        <QuickAddDialog
          key={session}
          options={latestOptions}
          onClose={close}
          onRestart={() => setSession((value) => value + 1)}
        />
      ) : null}
    </QuickAddContext.Provider>
  );
}

function ProductResult({
  product,
  onSelect,
}: {
  product: QuickAddProductResult;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-navy">
          {product.partNumber ?? product.compatibleModel ?? product.title}
        </span>
        <span className="mt-1 block truncate text-small text-muted-foreground">
          {product.brand} · {product.componentType}
          {product.compatibleModel ? ` · ${product.compatibleModel}` : ""}
        </span>
        <span className="mt-1 block font-mono text-xs text-primary">
          {product.sku}
          {product.status === "ARCHIVED" ? " · Archivado" : ""}
        </span>
        {product.primarySerialNumber ? (
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            Serie principal: {product.primarySerialNumber}
            {product.secondarySerialCount > 0
              ? ` · ${product.secondarySerialCount} secundario(s)`
              : ""}
          </span>
        ) : product.secondarySerialCount > 0 ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            {product.secondarySerialCount} serial(es) secundario(s)
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-small font-semibold text-primary group-hover:underline">
        Seleccionar
      </span>
    </button>
  );
}

function QuickAddDialog({
  options,
  onClose,
  onRestart,
}: {
  options: QuickAddOptions;
  onClose: () => void;
  onRestart: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(
    quickAddInventoryAction,
    initialMutationState,
  );
  const [step, setStep] = useState<"search" | "create" | "place">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickAddProductResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [showSimilarWarning, setShowSimilarWarning] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<QuickAddProductResult | null>(null);
  const [brandId, setBrandId] = useState(options.brands[0]?.id ?? "");
  const [customBrandName, setCustomBrandName] = useState("");
  const [componentTypeId, setComponentTypeId] = useState(
    options.componentTypes[0]?.id ?? "",
  );
  const [customComponentTypeName, setCustomComponentTypeName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [primarySerialNumber, setPrimarySerialNumber] = useState("");
  const [secondarySerialNumbers, setSecondarySerialNumbers] = useState<SerialNumberValue[]>([]);
  const [compatibilities, setCompatibilities] = useState<CompatibilityValue[]>([]);
  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState("");
  const initialLocationId = options.locations[0]?.id ?? "";
  const initialBox = options.boxes.find((box) => box.parentId === initialLocationId);
  const [locationId, setLocationId] = useState(initialLocationId);
  const [boxMode, setBoxMode] = useState<"existing" | "new">("existing");
  const [boxId, setBoxId] = useState(initialBox?.id ?? "");
  const [newBoxCode, setNewBoxCode] = useState("");
  const [newBoxName, setNewBoxName] = useState("");
  const [bagLabel, setBagLabel] = useState("");
  const [quantity, setQuantity] = useState(1);

  const resolvedLocationId = options.locations.some((location) => location.id === locationId)
    ? locationId
    : options.locations[0]?.id ?? "";
  const boxes = useMemo(
    () => options.boxes.filter((box) => box.parentId === resolvedLocationId),
    [resolvedLocationId, options.boxes],
  );
  const resolvedBoxId = boxes.some((box) => box.id === boxId)
    ? boxId
    : boxes[0]?.id ?? "";
  const selectedLocation = options.locations.find(
    (location) => location.id === resolvedLocationId,
  );
  const usesUnparentedBoxes = resolvedLocationId === UNPARENTED_BOXES_LOCATION_ID;
  const locationEmptyMessage = options.locationAvailability.total === 0
    ? "No hay ubicaciones disponibles."
    : "No hay ubicaciones activas.";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const response = await fetch(
          `/api/admin/models/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const body = (await response.json()) as {
          results?: QuickAddProductResult[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "No fue posible buscar productos.");
        setResults(body.results ?? []);
        setSearchedQuery(trimmed);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchError(error instanceof Error ? error.message : "No fue posible buscar productos.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const updateSearchQuery = (value: string) => {
    setQuery(value);
    setShowSimilarWarning(false);
    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError("");
      setSearchedQuery("");
    }
  };

  const updateLocation = (nextLocationId: string) => {
    const firstBox = options.boxes.find((box) => box.parentId === nextLocationId);
    setLocationId(nextLocationId);
    setBoxId(firstBox?.id ?? "");
    setBoxMode("existing");
    setNewBoxCode("");
    setNewBoxName("");
  };

  const close = () => {
    if (pending) return;
    dialogRef.current?.close();
    onClose();
  };

  const selectProduct = (product: QuickAddProductResult) => {
    setSelectedProduct(product);
    setPrimarySerialNumber("");
    setSecondarySerialNumbers([]);
    setCompatibilities([]);
    setStep("place");
  };

  const beginCreate = () => {
    if (results.length > 0 && !showSimilarWarning) {
      setShowSimilarWarning(true);
      return;
    }
    setSelectedProduct(null);
    setPartNumber(query.trim());
    setPrimarySerialNumber("");
    setSecondarySerialNumbers([]);
    setCompatibilities([]);
    setStep("create");
  };

  const continueNewProduct = () => {
    if (!brandId || !componentTypeId) {
      setCreateError("Selecciona marca y tipo de componente.");
      return;
    }
    if (!partNumber.trim() && compatibilities.length === 0) {
      setCreateError("Agrega un número de parte o un modelo compatible.");
      return;
    }
    if (brandId === CUSTOM_CATALOG_VALUE && !customBrandName.trim()) {
      setCreateError("Escribe el nombre de la nueva marca.");
      return;
    }
    if (
      componentTypeId === CUSTOM_CATALOG_VALUE &&
      !customComponentTypeName.trim()
    ) {
      setCreateError("Escribe el nombre del nuevo tipo de componente.");
      return;
    }
    if (
      brandId === CUSTOM_CATALOG_VALUE &&
      !partNumber.trim() &&
      compatibilities.length > 0
    ) {
      setCreateError("Una marca nueva necesita número de parte en este flujo rápido.");
      return;
    }
    const duplicateSerial = findDuplicateSerialNumber(
      primarySerialNumber.trim() || null,
      secondarySerialNumbers
        .map(({ value }) => value.trim())
        .filter(Boolean),
    );
    if (duplicateSerial) {
      setCreateError(
        `El número de serie ${duplicateSerial} está repetido dentro de este producto.`,
      );
      return;
    }
    setCreateError("");
    setStep("place");
  };

  const productMode = selectedProduct ? "existing" : "new";
  const selectedBrand = options.brands.find((brand) => brand.id === brandId);
  const selectedType = options.componentTypes.find((item) => item.id === componentTypeId);
  const modelSummary = selectedProduct
    ? selectedProduct.partNumber ?? selectedProduct.compatibleModel ?? selectedProduct.title
    : partNumber || compatibilities[0]?.model || "Nuevo producto";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="quick-add-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-0 h-svh max-h-svh w-full max-w-none overflow-hidden bg-transparent p-0 text-foreground backdrop:bg-navy/55 sm:m-auto sm:h-auto sm:max-h-[92dvh] sm:w-[min(52rem,calc(100%-2rem))] sm:rounded-3xl"
    >
      <form
        action={formAction}
        className="flex h-full min-h-0 flex-col overflow-hidden bg-background sm:max-h-[92dvh] sm:rounded-3xl sm:border sm:border-border sm:shadow-2xl"
        noValidate
      >
        <input type="hidden" name="productMode" value={productMode} />
        <input type="hidden" name="productId" value={selectedProduct?.id ?? ""} />
        <input type="hidden" name="brandId" value={brandId} />
        <input type="hidden" name="customBrandName" value={customBrandName} />
        <input type="hidden" name="componentTypeId" value={componentTypeId} />
        <input type="hidden" name="customComponentTypeName" value={customComponentTypeName} />
        <input type="hidden" name="partNumber" value={partNumber} />
        <input type="hidden" name="primarySerialNumber" value={primarySerialNumber} />
        <input
          type="hidden"
          name="secondarySerialNumbers"
          value={JSON.stringify(secondarySerialNumbers.map(({ value }) => value))}
        />
        <input type="hidden" name="compatibilities" value={JSON.stringify(compatibilities)} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="locationId" value={resolvedLocationId} />
        <input type="hidden" name="boxMode" value={boxMode} />
        <input type="hidden" name="boxId" value={resolvedBoxId} />
        <input type="hidden" name="newBoxCode" value={newBoxCode} />
        <input type="hidden" name="newBoxName" value={newBoxName} />
        <input type="hidden" name="bagLabel" value={bagLabel} />
        <input type="hidden" name="quantity" value={quantity} />

        <header className="shrink-0 flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <p className="text-label font-semibold uppercase tracking-[0.12em] text-primary">
              Entrada rápida
            </p>
            <h2 id="quick-add-title" className="mt-1 text-h3 text-navy">
              Agregar producto al inventario
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={close}
            disabled={pending}
            aria-label="Cerrar flujo"
            className="-mr-2 -mt-1"
          >
            <span aria-hidden="true" className="text-2xl leading-none">×</span>
          </Button>
        </header>

        {state.status === "success" ? (
          <div className="grid flex-1 place-items-center overflow-y-auto p-6 sm:p-10">
            <div className="w-full max-w-lg text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-2xl text-success" aria-hidden="true">✓</div>
              <h3 className="mt-5 text-h2 text-navy">Inventario actualizado</h3>
              <div className="mt-4"><FormFeedback state={state} /></div>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Button type="button" variant="outline" onClick={close}>Cerrar</Button>
                <Button type="button" onClick={onRestart}>Agregar otro</Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              {state.status === "error" ? <div className="mb-5"><FormFeedback state={state} /></div> : null}

              {step === "search" ? (
                <section aria-labelledby="search-model-title">
                  <h3 id="search-model-title" className="text-h2 text-navy">
                    ¿Qué producto quieres agregar?
                  </h3>
                  <p className="mt-2 text-small text-muted-foreground">
                    Busca un producto existente por nombre, SKU, número de parte, serial o modelo compatible.
                  </p>
                  <div className="relative mt-5">
                    <Label htmlFor="quick-model-search" className="sr-only">Buscar producto</Label>
                    <Input
                      ref={searchRef}
                      id="quick-model-search"
                      value={query}
                      onChange={(event) => updateSearchQuery(event.target.value)}
                      placeholder="Ej. BN94-07820F, Samsung, mainboard…"
                      autoComplete="off"
                      className="h-12 pr-11"
                    />
                    {searching ? <Spinner className="absolute right-4 top-4 text-primary" /> : null}
                  </div>
                  {searchError ? <p role="alert" className="mt-3 text-small text-danger">{searchError}</p> : null}

                  <div className="mt-5 space-y-3" aria-live="polite">
                    {results.map((product) => (
                      <ProductResult key={product.id} product={product} onSelect={() => selectProduct(product)} />
                    ))}
                  </div>

                  {searchedQuery && !searching && results.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-center">
                      <p className="font-semibold text-navy">No encontramos este producto</p>
                      <p className="mt-1 text-small text-muted-foreground">Revisa la búsqueda o crea un producto nuevo.</p>
                    </div>
                  ) : null}

                  {!searching ? (
                    <div className="mt-5 border-t border-border pt-5">
                      {showSimilarWarning && results.length > 0 ? (
                        <div className="rounded-xl border border-warning/25 bg-warning/5 p-4">
                          <p className="font-semibold text-navy">Encontramos productos parecidos</p>
                          <p className="mt-1 text-small text-muted-foreground">
                            Confirma que ninguno sea el producto correcto antes de crear otro.
                          </p>
                          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={beginCreate}>
                            Agregar producto nuevo de todas formas
                          </Button>
                        </div>
                      ) : (
                        <Button type="button" variant="outline" onClick={beginCreate}>
                          <span aria-hidden="true">+</span> Agregar producto nuevo
                        </Button>
                      )}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {step === "create" ? (
                <section aria-labelledby="create-model-title">
                  <button type="button" className="text-small font-semibold text-primary hover:underline" onClick={() => setStep("search")}>← Volver a buscar</button>
                  <h3 id="create-model-title" className="mt-4 text-h2 text-navy">Crear producto nuevo</h3>
                  <p className="mt-2 text-small text-muted-foreground">Solo necesitamos su identidad. Los datos comerciales e imágenes pueden completarse después.</p>
                  {createError ? <p role="alert" className="mt-4 rounded-xl border border-danger/25 bg-danger/5 p-3 text-small text-danger">{createError}</p> : null}
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="quick-brand">Marca</Label>
                      <Select id="quick-brand" value={brandId} onChange={(event) => setBrandId(event.target.value)} className="mt-2">
                        {options.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name} · {brand.code}</option>)}
                        <option value={CUSTOM_CATALOG_VALUE}>Agregar otra marca…</option>
                      </Select>
                      {brandId === CUSTOM_CATALOG_VALUE ? <Input aria-label="Nombre de la nueva marca" value={customBrandName} onChange={(event) => setCustomBrandName(event.target.value)} placeholder="Nombre de la nueva marca" className="mt-3" autoFocus /> : null}
                    </div>
                    <div>
                      <Label htmlFor="quick-component-type">Tipo de componente</Label>
                      <Select id="quick-component-type" value={componentTypeId} onChange={(event) => setComponentTypeId(event.target.value)} className="mt-2">
                        {options.componentTypes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}
                        <option value={CUSTOM_CATALOG_VALUE}>Agregar otro componente…</option>
                      </Select>
                      {componentTypeId === CUSTOM_CATALOG_VALUE ? <Input aria-label="Nombre del nuevo componente" value={customComponentTypeName} onChange={(event) => setCustomComponentTypeName(event.target.value)} placeholder="Nombre del nuevo componente" className="mt-3" autoFocus /> : null}
                    </div>
                    <div>
                      <Label htmlFor="quick-part-number">Número de parte</Label>
                      <Input id="quick-part-number" value={partNumber} onChange={(event) => setPartNumber(event.target.value)} placeholder="Ej. BN94-07820F" className="mt-2" />
                      <FieldError errors={state.fieldErrors?.partNumber} />
                    </div>
                    <div className="sm:col-span-2">
                      <ProductSerialFields
                        idPrefix="quick-product"
                        primarySerialNumber={primarySerialNumber}
                        onPrimarySerialNumberChange={setPrimarySerialNumber}
                        secondarySerialNumbers={secondarySerialNumbers}
                        onSecondarySerialNumbersChange={setSecondarySerialNumbers}
                        primaryErrors={state.fieldErrors?.primarySerialNumber}
                        secondaryErrors={state.fieldErrors?.secondarySerialNumbers}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <CompatibleModelsField
                        idPrefix="quick-product"
                        brands={options.brands}
                        value={compatibilities}
                        onChange={setCompatibilities}
                        defaultBrandId={
                          brandId === CUSTOM_CATALOG_VALUE
                            ? options.brands[0]?.id ?? ""
                            : brandId
                        }
                        errors={state.fieldErrors?.compatibilities}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="quick-title">Nombre administrativo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                      <Input id="quick-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Se generará automáticamente si lo dejas vacío" className="mt-2" />
                    </div>
                  </div>
                </section>
              ) : null}

              {step === "place" ? (
                <section aria-labelledby="place-model-title">
                  <button type="button" className="text-small font-semibold text-primary hover:underline" onClick={() => setStep(selectedProduct ? "search" : "create")}>← Cambiar producto</button>
                  <div className="mt-4 rounded-2xl border border-primary/20 bg-primary-soft/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">{selectedProduct ? "Producto encontrado" : "Producto nuevo"}</p>
                    <p className="mt-1 font-semibold text-navy">{modelSummary}</p>
                    <p className="mt-1 text-small text-muted-foreground">
                      {selectedProduct
                        ? `${selectedProduct.brand} · ${selectedProduct.componentType} · ${selectedProduct.sku}`
                        : `${selectedBrand?.name ?? customBrandName} · ${selectedType?.name ?? customComponentTypeName}`}
                    </p>
                  </div>

                  <h3 id="place-model-title" className="mt-6 text-h2 text-navy">¿Dónde quieres guardar estas piezas?</h3>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="quick-location">Ubicación</Label>
                      <Select id="quick-location" value={resolvedLocationId} onChange={(event) => updateLocation(event.target.value)} className="mt-2" disabled={options.locations.length === 0}>
                        {options.locations.length === 0 ? <option value="">{locationEmptyMessage}</option> : null}
                        {options.locations.map((location) => <option key={location.id} value={location.id}>{location.breadcrumb}</option>)}
                      </Select>
                      {selectedLocation?.kind === "unparented-boxes" ? (
                        <p className="mt-2 text-xs text-warning">
                          Estas cajas activas aún no tienen una ubicación padre. Puedes usarlas sin confundirlas con una ubicación física.
                        </p>
                      ) : null}
                      <FieldError errors={state.fieldErrors?.locationId} />
                    </div>

                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="quick-box">Caja</Label>
                        {boxMode === "new" && boxes.length > 0 ? <button type="button" className="text-small font-semibold text-primary hover:underline" onClick={() => { setBoxMode("existing"); setBoxId(boxes[0]?.id ?? ""); }}>Seleccionar existente</button> : null}
                      </div>
                      {boxMode === "existing" ? (
                        <>
                          {boxes.length > 0 ? (
                            <Select id="quick-box" value={resolvedBoxId} onChange={(event) => setBoxId(event.target.value)} className="mt-2">
                              <option value="">Selecciona una caja</option>
                              {boxes.map((box) => <option key={box.id} value={box.id}>{box.code} · {box.name}</option>)}
                            </Select>
                          ) : (
                            <p className="mt-2 rounded-xl bg-muted px-4 py-3 text-small text-muted-foreground">
                              No hay cajas en esta ubicación.
                            </p>
                          )}
                          {!usesUnparentedBoxes ? (
                            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { setBoxMode("new"); setBoxId(""); }}>
                              + Crear caja
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <div className="mt-2 grid gap-3 rounded-xl border border-primary/20 bg-primary-soft/30 p-4 sm:grid-cols-2">
                          <div><Label htmlFor="quick-new-box-code">Código</Label><Input id="quick-new-box-code" value={newBoxCode} onChange={(event) => setNewBoxCode(event.target.value)} placeholder="A12" className="mt-2 bg-background" /><FieldError errors={state.fieldErrors?.newBoxCode} /></div>
                          <div><Label htmlFor="quick-new-box-name">Nombre</Label><Input id="quick-new-box-name" value={newBoxName} onChange={(event) => setNewBoxName(event.target.value)} placeholder="Caja A12" className="mt-2 bg-background" /><FieldError errors={state.fieldErrors?.newBoxName} /></div>
                          <p className="text-xs text-muted-foreground sm:col-span-2">Se creará y seleccionará al confirmar; cancelar no deja una caja vacía.</p>
                        </div>
                      )}
                      <FieldError errors={state.fieldErrors?.boxId} />
                    </div>

                    <div>
                      <Label htmlFor="quick-bag">Bolsa <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                      <Input id="quick-bag" value={bagLabel} onChange={(event) => setBagLabel(event.target.value)} placeholder="Ej. Bolsa 12" className="mt-2" />
                      <p className="mt-1.5 text-xs text-muted-foreground">Déjalo vacío para guardar sin bolsa.</p>
                    </div>
                    <div>
                      <Label htmlFor="quick-quantity">Cantidad</Label>
                      <div className="mt-2 flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon" aria-label="Restar una unidad" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</Button>
                        <Input id="quick-quantity" type="number" inputMode="numeric" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="text-center text-lg font-semibold" />
                        <Button type="button" variant="outline" size="icon" aria-label="Sumar una unidad" onClick={() => setQuantity((value) => value + 1)}>+</Button>
                      </div>
                      <FieldError errors={state.fieldErrors?.quantity} />
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            <footer className="relative z-10 shrink-0 border-t border-border bg-card px-5 py-4 sm:px-7">
              {step === "create" ? (
                <div className="flex justify-end"><Button type="button" onClick={continueNewProduct}>Continuar con ubicación</Button></div>
              ) : null}
              {step === "place" ? (
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">Producto + caja nueva + inventario se guardan juntos.</p>
                  <Button type="submit" isLoading={pending} loadingLabel="Agregando…" disabled={!resolvedLocationId || quantity < 1 || (boxMode === "existing" ? !resolvedBoxId : !newBoxCode.trim() || !newBoxName.trim())}>
                    Agregar {Number.isFinite(quantity) && quantity > 0 ? quantity : ""} al inventario
                  </Button>
                </div>
              ) : null}
              {step === "search" ? <p className="text-center text-xs text-muted-foreground">Selecciona un producto o agrega uno nuevo.</p> : null}
            </footer>
          </>
        )}
      </form>
    </dialog>
  );
}
