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
  useTransition,
} from "react";

import { FieldError, FormFeedback } from "@/components/forms/form-feedback";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { PhotoSelection } from "@/features/images/components/photo-selection";
import { usePhotoUploads } from "@/features/images/components/use-photo-uploads";
import { UNPARENTED_BOXES_LOCATION_ID } from "@/features/locations/domain/quick-add-location";
import { QuickAddLocationEditor } from "@/features/locations/components/quick-add-location-editor";
import { quickAddInventoryMutationSchema, quickAddWizardSchemas } from "@/validators/quick-add-inventory";
import { quickAddErrorStep, quickAddSteps, type WizardStep } from "@/features/inventory/domain/quick-add-wizard";
import { getPublicAvailability } from "@/features/catalog/domain/catalog";
import { productConditionLabels, type ProductCondition } from "@/features/products/domain/product-condition";
import { CUSTOM_CATALOG_VALUE } from "@/features/products/domain/catalog-selection";
import {
  CompatibleModelsField,
  type CompatibilityValue,
} from "@/features/products/components/compatible-models-field";
import {
  ProductSerialFields,
  type SerialNumberValue,
} from "@/features/products/components/product-serial-fields";
import {
  createBrandInlineAction,
  createComponentTypeInlineAction,
} from "@/features/products/server/catalog-actions";
import type { QuickAddProductResult } from "@/features/inventory/data/quick-add-queries";
import {
  quickAddInventoryAction,
  type QuickAddMutationState,
} from "@/features/inventory/server/actions";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

type CatalogOption = { id: string; name: string; code: string };
type LocationOption = {
  id: string;
  code: string;
  name: string;
  breadcrumb: string;
  kind: "container" | "unparented-boxes";
  updatedAt?: string;
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
  const [startNew, setStartNew] = useState(false);
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
    setStartNew(false);
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
          startNew={startNew}
          onRestart={() => { setStartNew(true); setSession((value) => value + 1); }}
          onOptionsChanged={setLatestOptions}
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
      className="group flex w-full items-start justify-between gap-4 rounded-md bg-card p-4 text-left shadow-sm transition-colors hover:bg-primary-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-navy">
          {product.partNumber ?? product.compatibleModel ?? product.title}
        </span>
        <span className="mt-1 block truncate text-small text-muted-foreground">
          {product.brand} · {product.componentType}
          {product.compatibleModel ? ` · ${product.compatibleModel}` : ""}
        </span>
        <span className="mt-1 block font-mono text-xs text-link">
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
      <span className="shrink-0 text-small font-semibold text-link group-hover:underline">
        Seleccionar
      </span>
    </button>
  );
}

function QuickCatalogField({
  kind,
  options,
  value,
  onChange,
  onCreated,
  errors,
  onBusyChange,
}: {
  kind: "brand" | "componentType";
  options: CatalogOption[];
  value: string;
  onChange: (value: string) => void;
  onCreated: (entry: CatalogOption) => void;
  errors?: string[];
  onBusyChange: (busy: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, startTransition] = useTransition();
  useEffect(() => { onBusyChange(saving); }, [saving, onBusyChange]);
  const isBrand = kind === "brand";
  const noun = isBrand ? "marca" : "tipo de pieza";
  const filtered = options.filter((option) =>
    `${option.name} ${option.code}`.toLocaleLowerCase("es-MX")
      .includes(query.trim().toLocaleLowerCase("es-MX")),
  );

  const save = () => {
    if (!name.trim()) {
      setError(isBrand ? "Escribe el nombre de la nueva marca." : "Escribe el nombre del nuevo tipo de pieza.");
      return;
    }
    setError("");
    setMessage("");
    startTransition(async () => {
      const body = new FormData();
      body.set("name", name);
      const result = isBrand
        ? await createBrandInlineAction(body)
        : await createComponentTypeInlineAction(body);
      if (result.status === "error" || !result.entry) {
        setError(result.message ?? `No fue posible guardar ${isBrand ? "la marca" : "el tipo de pieza"}.`);
        return;
      }
      onCreated(result.entry);
      onChange(result.entry.id);
      setMessage(result.message ?? "Guardado.");
      setCreating(false);
      setName("");
      setQuery("");
    });
  };

  return (
    <div>
      <Label htmlFor={`quick-${kind}`}>{isBrand ? "Marca" : "Tipo de pieza"}</Label>
      <Input
        id={`quick-${kind}-search`}
        aria-label={isBrand ? "Buscar marca" : "Buscar tipo de pieza"}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={isBrand ? "Buscar marca…" : "Buscar tipo de pieza…"}
        className="mt-2"
        autoComplete="off"
      />
      <Select
        aria-invalid={Boolean(errors?.length)}
        aria-describedby={errors?.length ? `quick-${kind}-error` : undefined}
        id={`quick-${kind}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2"
      >
        <option value="">Selecciona {isBrand ? "una marca" : "un tipo de pieza"}</option>
        {value && !filtered.some((option) => option.id === value) ? options.filter((option) => option.id === value).map((option) => <option key={option.id} value={option.id}>{option.name}</option>) : null}
        {filtered.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </Select>
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => { setCreating((current) => !current); setError(""); }}>
        + Agregar {isBrand ? "nueva marca" : "tipo de pieza"}
      </Button>
      {creating ? (
        <div className="mt-2 rounded-md bg-primary-soft/50 p-3">
          <Label htmlFor={`quick-${kind}-new`}>{isBrand ? "Nueva marca" : "Nuevo tipo de pieza"}</Label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id={`quick-${kind}-new`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoFocus
              disabled={saving}
            />
            <Button type="button" size="sm" onClick={save} isLoading={saving} loadingLabel="Guardando…">
              Guardar {noun}
            </Button>
          </div>
        </div>
      ) : null}
      {errors?.length ? <div id={`quick-${kind}-error`}><FieldError errors={errors} /></div> : null}
      {error ? <p role="alert" className="mt-2 text-small text-danger">{error}</p> : null}
      {message ? <p role="status" className="mt-2 text-small text-success">{message}</p> : null}
    </div>
  );
}

function QuickAddDialog({
  options: initialOptions,
  startNew,
  onClose,
  onRestart,
  onOptionsChanged,
}: {
  options: QuickAddOptions;
  startNew: boolean;
  onClose: () => void;
  onRestart: () => void;
  onOptionsChanged: (options: QuickAddOptions) => void;
}) {
  const [inlineOptions, setOptions] = useState<QuickAddOptions | null>(null);
  const options = inlineOptions ?? initialOptions;
  const [locationEditor, setLocationEditor] = useState<"create" | "edit" | null>(null);
  const [locationSaving, setLocationSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const stepTitleRef = useRef<HTMLHeadingElement>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [clientErrors, setClientErrors] = useState<Record<string, string[] | undefined>>({});
  const [brandSaving, setBrandSaving] = useState(false);
  const [typeSaving, setTypeSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (previous: QuickAddMutationState, body: FormData) => {
      const result = await quickAddInventoryAction(previous, body);
      if (result.status === "error" && body.get("productMode") === "new") {
        setWizardStep(quickAddErrorStep(result.fieldErrors, result.message));
        setClientErrors(result.fieldErrors ?? {});
        focusError();
      }
      return result;
    },
    { status: "idle" } as QuickAddMutationState,
  );
  const [catalogOptions, setCatalogOptions] = useState({
    brands: options.brands,
    componentTypes: options.componentTypes,
  });
  const [step, setStep] = useState<"search" | "create" | "place">(startNew ? "create" : "search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickAddProductResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [showSimilarWarning, setShowSimilarWarning] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<QuickAddProductResult | null>(null);
  const [brandId, setBrandId] = useState("");
  const customBrandName = "";
  const [componentTypeId, setComponentTypeId] = useState(
    "",
  );
  const customComponentTypeName = "";
  const [partNumber, setPartNumber] = useState("");
  const [primarySerialNumber, setPrimarySerialNumber] = useState("");
  const [secondarySerialNumbers, setSecondarySerialNumbers] = useState<SerialNumberValue[]>([]);
  const [compatibilities, setCompatibilities] = useState<CompatibilityValue[]>([]);
  const [compatibleBrandId, setCompatibleBrandId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [warranty, setWarranty] = useState("");
  const [condition, setCondition] = useState<ProductCondition>("NEW");
  const [status, setStatus] = useState<"ACTIVE" | "DRAFT" | "ARCHIVED">("ACTIVE");
  const [isPublic, setIsPublic] = useState(true);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photosValidating, setPhotosValidating] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const { states: photoStates, uploadState, uploadError, retry: retryPhotos } = usePhotoUploads(
    photos, state.productId, state.status === "success" && !!state.productCreated,
  );
  const photosBusy = uploadState === "uploading" || (uploadState === "idle" && state.status === "success" && !!state.productCreated && photos.length > 0);
  const initialLocationId = options.locations[0]?.id ?? "";
  const initialBox = options.boxes.find((box) => box.parentId === initialLocationId);
  const [locationId, setLocationId] = useState(startNew ? "" : initialLocationId);
  const [boxMode, setBoxMode] = useState<"existing" | "new">("existing");
  const [boxId, setBoxId] = useState(startNew ? "" : initialBox?.id ?? "");
  const [newBoxCode, setNewBoxCode] = useState("");
  const [newBoxName, setNewBoxName] = useState("");
  const [bagLabel, setBagLabel] = useState("");
  const [quantity, setQuantity] = useState(1);

  const resolvedLocationId = !locationId ? "" : options.locations.some((location) => location.id === locationId)
    ? locationId
    : options.locations[0]?.id ?? "";
  const boxes = useMemo(
    () => options.boxes.filter((box) => box.parentId === resolvedLocationId),
    [resolvedLocationId, options.boxes],
  );
  const resolvedBoxId = !boxId ? "" : boxes.some((box) => box.id === boxId)
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
    requestAnimationFrame(() => (searchRef.current ?? stepTitleRef.current)?.focus());
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const viewport = window.visualViewport;
    if (!dialog || !viewport) return;
    let frame = 0;
    const update = () => {
      if (window.innerWidth < 640 && viewport.scale === 1) {
        dialog.style.setProperty("--quick-add-viewport-height", `${viewport.height}px`);
        dialog.style.setProperty("--quick-add-viewport-top", `${viewport.offsetTop}px`);
      } else {
        dialog.style.removeProperty("--quick-add-viewport-height");
        dialog.style.removeProperty("--quick-add-viewport-top");
      }
    };
    const resize = () => {
      update();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.closest("[data-step-content]")) {
          active.scrollIntoView({ block: "nearest" });
        }
      });
    };
    update();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", resize);
    };
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
    setLocationEditor(null);
    const firstBox = options.boxes.find((box) => box.parentId === nextLocationId);
    setLocationId(nextLocationId);
    setBoxId(firstBox?.id ?? "");
    setBoxMode("existing");
    setNewBoxCode("");
    setNewBoxName("");
  };

  const busy = pending || photosValidating || modelSaving || locationSaving || brandSaving || typeSaving || photosBusy;
  const dirty = !selectedProduct && (Boolean(brandId || componentTypeId || partNumber || title || primarySerialNumber || salePrice || warranty || bagLabel || newBoxCode || newBoxName) || secondarySerialNumbers.length > 0 || compatibilities.length > 0 || photos.length > 0 || quantity !== 1 || condition !== "NEW" || status !== "ACTIVE" || !isPublic || (Boolean(locationId) && locationId !== initialLocationId) || (Boolean(boxId) && boxId !== (initialBox?.id ?? "")));
  const discard = () => { dialogRef.current?.close(); onClose(); };
  const close = () => {
    if (busy) return;
    if (state.status !== "success" && dirty) { setConfirmClose(true); return; }
    discard();
  };
  const moveTo = (next: WizardStep) => {
    setWizardStep(next);
    setClientErrors({});
    requestAnimationFrame(() => {
      stepTitleRef.current?.focus();
      dialogRef.current?.querySelector("[data-step-content]")?.scrollTo(0, 0);
    });
  };
  function focusError() {
    requestAnimationFrame(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?? dialogRef.current?.querySelector<HTMLElement>("[data-validation-alert]");
      target?.focus();
      target?.scrollIntoView({ block: "nearest" });
    });
  }

  const selectProduct = (product: QuickAddProductResult) => {
    setSelectedProduct(product);
    if (!locationId) updateLocation(initialLocationId);
    setPhotos([]);
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
    if (!brandId && !componentTypeId) { setLocationId(""); setBoxId(""); }
    setPartNumber(query.trim());
    setPrimarySerialNumber("");
    setSecondarySerialNumbers([]);
    setCompatibilities([]);
    moveTo(1);
    setStep("create");
  };

  const payload = {
    productMode: "new", productId: "", brandId, customBrandName, componentTypeId, customComponentTypeName,
    partNumber, primarySerialNumber, secondarySerialNumbers: secondarySerialNumbers.map(({ value }) => value),
    compatibilities, title, salePrice, warranty, currency: "MXN", condition, status, isPublic,
    locationId: resolvedLocationId, boxMode, boxId: resolvedBoxId, newBoxCode, newBoxName, bagLabel, quantity,
  };
  const validateStep = (current: WizardStep) => current === 4 ? null : quickAddWizardSchemas[current].safeParse(payload);
  const continueNewProduct = () => {
    const result = validateStep(wizardStep);
    if (result && !result.success) {
      setClientErrors(result.error.flatten().fieldErrors);
      focusError();
      return;
    }
    moveTo((wizardStep + 1) as WizardStep);
  };
  const errors = clientErrors;
  const inventoryErrors = selectedProduct ? state.fieldErrors : errors;

  const productMode = selectedProduct ? "existing" : "new";
  const selectedBrand = catalogOptions.brands.find((brand) => brand.id === brandId);
  const selectedType = catalogOptions.componentTypes.find((item) => item.id === componentTypeId);
  const modelSummary = selectedProduct
    ? selectedProduct.partNumber ?? selectedProduct.compatibleModel ?? selectedProduct.title
    : partNumber || compatibilities[0]?.model || "Nuevo producto";

  return (
    <dialog
      ref={dialogRef}
      aria-label="Agregar producto al inventario" aria-describedby="quick-add-title"
      onCancel={(event) => {
        event.preventDefault();
        if (confirmClose) { setConfirmClose(false); requestAnimationFrame(() => stepTitleRef.current?.focus()); }
        else close();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="top-[var(--quick-add-viewport-top,0px)] m-0 h-svh max-h-[min(100svh,var(--quick-add-viewport-height,100svh))] w-full max-w-none overflow-hidden bg-transparent p-0 text-foreground backdrop:bg-overlay/55 sm:top-0 sm:m-auto sm:h-auto sm:max-h-[92dvh] sm:w-[min(52rem,calc(100%-2rem))] sm:rounded-md"
    >
      <form
        action={formAction}
        onSubmit={(event) => {
          if ((selectedProduct ? step !== "place" : step !== "create" || wizardStep !== 5) || busy || locationEditor !== null || state.status === "success") { event.preventDefault(); return; }
          if (!selectedProduct) {
            for (const current of [1, 2, 3, 5] as const) {
              const result = validateStep(current);
              if (result && !result.success) {
                event.preventDefault(); setWizardStep(current); setClientErrors(result.error.flatten().fieldErrors); focusError(); return;
              }
            }
            const result = quickAddInventoryMutationSchema.safeParse(payload);
            if (!result.success) {
              event.preventDefault(); const fields = result.error.flatten().fieldErrors;
              setWizardStep(quickAddErrorStep(fields)); setClientErrors(fields); focusError();
            }
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type !== "checkbox") event.preventDefault();
          if (event.key === "Tab") {
            const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
            ) ?? []).filter((element) => element.getClientRects().length > 0);
            const first = controls[0], last = controls.at(-1);
            const active = document.activeElement;
            if (event.shiftKey && (active === first || !controls.includes(active as HTMLElement))) {
              event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && active === last) {
              event.preventDefault(); first?.focus();
            }
          }
        }}
        className="flex h-full min-h-0 flex-col overflow-hidden bg-background sm:h-auto sm:max-h-[92dvh] sm:rounded-md sm:shadow-lg"
        noValidate
      >
        <input type="hidden" name="productMode" value={productMode} />
        <input type="hidden" name="productId" value={selectedProduct?.id ?? ""} />
        {productMode === "new" ? <>
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
        <input type="hidden" name="salePrice" value={salePrice} />
        <input type="hidden" name="warranty" value={warranty} />
        <input type="hidden" name="condition" value={condition} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="isPublic" value={String(isPublic)} />
        </> : null}
        <input type="hidden" name="locationId" value={resolvedLocationId} />
        <input type="hidden" name="boxMode" value={boxMode} />
        <input type="hidden" name="boxId" value={resolvedBoxId} />
        <input type="hidden" name="newBoxCode" value={newBoxCode} />
        <input type="hidden" name="newBoxName" value={newBoxName} />
        <input type="hidden" name="bagLabel" value={bagLabel} />
        <input type="hidden" name="quantity" value={quantity} />

        <header className="shrink-0 flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7 sm:py-5">
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold text-link">
              {step === "create" && state.status !== "success" ? `Paso ${wizardStep} de 5` : "Entrada rápida"}
            </p>
            <h2 ref={stepTitleRef} tabIndex={-1} id="quick-add-title" className="mt-1 text-h3 text-navy">
              {step === "create" && state.status !== "success" ? quickAddSteps[wizardStep - 1] : "Agregar producto al inventario"}
            </h2>
            {step === "create" && state.status !== "success" ? <>
              <div role="progressbar" aria-label="Progreso de creación del producto" aria-valuemin={1} aria-valuemax={5} aria-valuenow={wizardStep} aria-valuetext={`Paso ${wizardStep} de 5: ${quickAddSteps[wizardStep - 1]}`} className="mt-3 flex gap-2">
                {quickAddSteps.map((name, index) => <span key={name} aria-hidden="true" className={cn("h-1.5 flex-1 rounded-sm", index + 1 === wizardStep ? "bg-primary" : index + 1 < wizardStep && (validateStep((index + 1) as WizardStep)?.success ?? true) ? "bg-primary/60" : "bg-border")} />)}
              </div>
              <p className="mt-2 text-small text-muted-foreground">{wizardStep < 5 ? `Después: ${quickAddSteps[Number(wizardStep)]}.` : "Revisa los datos y confirma para guardar."}</p>
            </> : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={close}
            disabled={busy}
            aria-label="Cerrar flujo"
            className="-mr-2 -mt-1"
          >
            <span aria-hidden="true" className="text-2xl leading-none">×</span>
          </Button>
        </header>

        {confirmClose ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-6" role="alertdialog" aria-labelledby="quick-discard-title" aria-describedby="quick-discard-description">
            <h3 id="quick-discard-title" className="text-h3 text-navy">¿Descartar este producto?</h3>
            <p id="quick-discard-description" className="mt-3">Los datos y las fotos seleccionadas se perderán.</p>
            <div className="mt-5 flex flex-wrap gap-3"><Button type="button" autoFocus onClick={() => { setConfirmClose(false); requestAnimationFrame(() => stepTitleRef.current?.focus()); }}>Seguir editando</Button><Button type="button" variant="outline" onClick={discard}>Descartar y cerrar</Button></div>
          </div>
        ) : state.status === "success" ? (
          <div className="grid flex-1 place-items-center overflow-y-auto p-6 sm:p-10">
            <div className="w-full max-w-lg text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-2xl text-success" aria-hidden="true">✓</div>
              <h3 className="mt-5 text-h2 text-navy">
                {uploadState === "uploading" ? "Subiendo fotos…" : state.productCreated ? "Producto agregado correctamente" : "Existencias agregadas correctamente"}
              </h3>
              <div className="mt-4"><FormFeedback state={state} /></div>
              {state.productCreated ? <p className="mt-3 text-small">{state.publicationPath ? "Publicación: visible en el catálogo público." : "Publicación: este producto no está visible en el catálogo público."}</p> : null}
              {state.productCreated && photos.length === 0 ? <p className="mt-2 text-small text-muted-foreground">Sin fotos agregadas.</p> : null}
              {state.productCreated && photos.length > 0 && uploadState === "idle" ? <p role="status" className="mt-2 text-small">Preparando las fotos…</p> : null}
              {uploadState === "done" ? (
                <p role="status" className="mt-3 text-small text-success">Las fotos se guardaron correctamente.</p>
              ) : null}
              {uploadState === "error" ? (
                <div className="mt-4 rounded-md bg-danger/10 p-4 text-left text-small text-danger">
                  <p className="font-semibold">El producto y el inventario sí se guardaron.</p>
                  <p className="mt-1">{uploadError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void retryPhotos()}
                  >
                    Reintentar fotos pendientes
                  </Button>
                </div>
              ) : null}
              {photos.length > 0 ? <div className="mt-4"><PhotoSelection id="quick-uploaded-photos" files={photos} onChange={setPhotos} states={photoStates} locked onRetry={uploadState === "error" ? () => void retryPhotos() : undefined} /></div> : null}
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                {state.publicationPath ? <a href={state.publicationPath} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "outline" })}>Ver publicación</a> : null}
                <Button type="button" variant="outline" onClick={close} disabled={photosBusy}>Cerrar</Button>
                <Button type="button" onClick={onRestart} disabled={photosBusy}>Agregar otro producto</Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div data-step-content className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              {state.status === "error" ? <div data-validation-alert tabIndex={-1} className="mb-5"><FormFeedback state={state} /></div> : null}

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
                    {searching ? <Spinner className="absolute right-4 top-4 text-link" /> : null}
                  </div>
                  {searchError ? <p role="alert" className="mt-3 text-small text-danger">{searchError}</p> : null}

                  <div className="mt-5 space-y-3" aria-live="polite">
                    {results.map((product) => (
                      <ProductResult key={product.id} product={product} onSelect={() => selectProduct(product)} />
                    ))}
                  </div>

                  {searchedQuery && !searching && results.length === 0 ? (
                    <div className="mt-5 rounded-md border border-dashed border-border bg-muted/40 p-5 text-center">
                      <p className="font-semibold text-navy">No encontramos este producto</p>
                      <p className="mt-1 text-small text-muted-foreground">Revisa la búsqueda o crea un producto nuevo.</p>
                    </div>
                  ) : null}

                  {!searching ? (
                    <div className="mt-5 border-t border-border pt-5">
                      {showSimilarWarning && results.length > 0 ? (
                        <div className="rounded-md bg-warning/5 p-4 shadow-sm">
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
                <section aria-label={quickAddSteps[wizardStep - 1]}>
                  {Object.values(errors).some((value) => value?.length) ? <p data-validation-alert tabIndex={-1} role="alert" className="mb-4 text-small text-danger">Revisa los campos marcados antes de continuar.</p> : null}
                  {wizardStep === 1 ? <div className="grid gap-5 sm:grid-cols-2">
                    <button type="button" disabled={busy} className="text-left text-small font-semibold text-link hover:underline sm:col-span-2" onClick={() => setStep("search")}>← Volver a buscar</button>
                    <QuickCatalogField
                      kind="brand"
                      options={catalogOptions.brands}
                      value={brandId}
                      errors={errors.brandId}
                      onBusyChange={setBrandSaving}
                      onChange={setBrandId}
                      onCreated={(entry) => setCatalogOptions((current) => ({
                        ...current,
                        brands: current.brands.some((item) => item.id === entry.id)
                          ? current.brands
                          : [...current.brands, entry].sort((left, right) => left.name.localeCompare(right.name, "es")),
                      }))}
                    />
                    <QuickCatalogField
                      kind="componentType"
                      options={catalogOptions.componentTypes}
                      value={componentTypeId}
                      errors={errors.componentTypeId}
                      onBusyChange={setTypeSaving}
                      onChange={setComponentTypeId}
                      onCreated={(entry) => setCatalogOptions((current) => ({
                        ...current,
                        componentTypes: current.componentTypes.some((item) => item.id === entry.id)
                          ? current.componentTypes
                          : [...current.componentTypes, entry].sort((left, right) => left.name.localeCompare(right.name, "es")),
                      }))}
                    />
                  </div> : null}
                  {wizardStep === 2 ? <div className="grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="quick-title">Nombre del producto <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                      <FieldError errors={errors.title} /><Input id="quick-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Se generará automáticamente si lo dejas vacío" className="mt-2" />
                    </div>
                    <div>
                      <Label htmlFor="quick-part-number">Número de parte</Label>
                      <Input aria-invalid={Boolean(errors.partNumber?.length)} id="quick-part-number" value={partNumber} onChange={(event) => setPartNumber(event.target.value)} placeholder="Ej. BN94-07820F" className="mt-2" />
                      <FieldError errors={errors?.partNumber} />
                    </div>
                    <div className="sm:col-span-2">
                      <ProductSerialFields
                        idPrefix="quick-product"
                        primarySerialNumber={primarySerialNumber}
                        onPrimarySerialNumberChange={setPrimarySerialNumber}
                        secondarySerialNumbers={secondarySerialNumbers}
                        onSecondarySerialNumbersChange={setSecondarySerialNumbers}
                        primaryErrors={errors?.primarySerialNumber}
                        secondaryErrors={errors?.secondarySerialNumbers}
                      />
                    </div>
                    <p className="text-small text-muted-foreground sm:col-span-2">Necesitamos un número de parte o un modelo compatible. Puedes seleccionar los modelos en el siguiente paso.</p>
                  </div> : null}
                  {wizardStep === 3 ? <>
                    <div className="sm:col-span-2">
                      <CompatibleModelsField
                        idPrefix="quick-product"
                        brands={catalogOptions.brands}
                        value={compatibilities}
                        searchBrandId={compatibleBrandId}
                        onSearchBrandChange={setCompatibleBrandId}
                        onChange={setCompatibilities}
                        defaultBrandId={
                          brandId === CUSTOM_CATALOG_VALUE
                            ? catalogOptions.brands[0]?.id ?? ""
                            : brandId
                        }
                        errors={errors?.compatibilities}
                        onBusyChange={setModelSaving}
                      />
                    </div>
                    <p className="mt-4 text-small text-muted-foreground">{partNumber.trim() ? "Puedes agregar modelos compatibles ahora o hacerlo después." : "Selecciona un modelo compatible o vuelve a Identificación para agregar el número de parte."}</p>
                  </> : null}
                  {wizardStep === 4 ? <>
                    <div className="sm:col-span-2">
                      <PhotoSelection id="quick-product-photos" files={photos} onChange={setPhotos} onValidating={setPhotosValidating} />
                    </div>
                    <p className="mt-4 text-small text-muted-foreground">Puedes agregar fotos ahora o hacerlo después. Se subirán cuando el producto y el inventario estén guardados.</p>
                  </> : null}
                </section>
              ) : null}

              {step === "place" || (step === "create" && wizardStep === 5) ? (
                <section aria-labelledby="place-model-title">
                  {selectedProduct ? <button type="button" className="text-small font-semibold text-link hover:underline" onClick={() => setStep("search")}>← Cambiar producto</button> : null}
                  <div className="mt-4 break-words rounded-md bg-primary-soft/50 p-4">
                    <p className="text-xs font-semibold text-link">{selectedProduct ? "Producto encontrado" : "Producto nuevo"}</p>
                    <p className="mt-1 font-semibold text-navy">{selectedProduct ? modelSummary : title || modelSummary}</p>
                    <p className="mt-1 text-small text-muted-foreground">
                      {selectedProduct
                        ? `${selectedProduct.brand} · ${selectedProduct.componentType} · ${selectedProduct.sku}`
                        : `${selectedBrand?.name ?? customBrandName} · ${selectedType?.name ?? customComponentTypeName}`}
                    </p>
                    {!selectedProduct ? <p className="mt-2 text-small">{status === "ACTIVE" && isPublic ? "Se mostrará en el catálogo público." : "Se guardará sin visibilidad pública."} Precio: {salePrice ? `${formatMoney(salePrice)} MXN` : "Consultar precio"}.</p> : null}
                  </div>

                  <h3 id="place-model-title" className="mt-6 text-h3 text-navy">{selectedProduct ? "¿Dónde quieres guardar estas piezas?" : "Inventario"}</h3>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="quick-location">Ubicación</Label>
                      <Select aria-invalid={Boolean(inventoryErrors?.locationId?.length)} id="quick-location" value={resolvedLocationId} onChange={(event) => updateLocation(event.target.value)} className="mt-2" disabled={locationSaving || options.locations.length === 0}>
                        <option value="">{options.locations.length === 0 ? locationEmptyMessage : "Selecciona una ubicación"}</option>
                        {options.locations.map((location) => <option key={location.id} value={location.id}>{location.breadcrumb}</option>)}
                      </Select>
                      {selectedLocation?.kind === "unparented-boxes" ? (
                        <p className="mt-2 text-xs text-warning">
                          Estas cajas activas aún no tienen una ubicación padre. Puedes usarlas sin confundirlas con una ubicación física.
                        </p>
                      ) : null}
                      <FieldError errors={inventoryErrors?.locationId} />
                      <div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" disabled={locationSaving} onClick={() => setLocationEditor("create")}>+ Agregar ubicación</Button>{selectedLocation?.kind === "container" ? <Button type="button" variant="ghost" size="sm" disabled={locationSaving} onClick={() => setLocationEditor("edit")}>Editar ubicación</Button> : null}</div>
                      {locationEditor ? <QuickAddLocationEditor key={`${locationEditor}-${selectedLocation?.id ?? ""}`} location={locationEditor === "edit" ? selectedLocation : undefined} onBusyChange={setLocationSaving} onRefreshed={(next) => { setOptions(next); onOptionsChanged(next); }} onCancel={() => setLocationEditor(null)} onSaved={(next, id) => {
                        setOptions(next);
                        onOptionsChanged(next);
                        if (locationEditor === "create") {
                          setLocationId(id); setBoxId(""); setBoxMode("existing");
                        }
                        setLocationEditor(null);
                      }} /> : null}
                    </div>

                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="quick-box">Caja</Label>
                        {boxMode === "new" && boxes.length > 0 ? <button type="button" className="text-small font-semibold text-link hover:underline" onClick={() => { setBoxMode("existing"); setBoxId(boxes[0]?.id ?? ""); }}>Seleccionar existente</button> : null}
                      </div>
                      {boxMode === "existing" ? (
                        <>
                          {boxes.length > 0 ? (
                            <Select aria-invalid={Boolean(inventoryErrors?.boxId?.length)} id="quick-box" value={resolvedBoxId} onChange={(event) => setBoxId(event.target.value)} className="mt-2">
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
                        <div className="mt-2 grid gap-3 rounded-md bg-primary-soft/30 p-4 sm:grid-cols-2">
                          <div><Label htmlFor="quick-new-box-code">Código</Label><Input aria-invalid={Boolean(inventoryErrors?.newBoxCode?.length)} id="quick-new-box-code" value={newBoxCode} onChange={(event) => setNewBoxCode(event.target.value)} placeholder="A12" className="mt-2 bg-background" /><FieldError errors={inventoryErrors?.newBoxCode} /></div>
                          <div><Label htmlFor="quick-new-box-name">Nombre</Label><Input aria-invalid={Boolean(inventoryErrors?.newBoxName?.length)} id="quick-new-box-name" value={newBoxName} onChange={(event) => setNewBoxName(event.target.value)} placeholder="Caja A12" className="mt-2 bg-background" /><FieldError errors={inventoryErrors?.newBoxName} /></div>
                          <p className="text-xs text-muted-foreground sm:col-span-2">Se creará y seleccionará al confirmar; cancelar no deja una caja vacía.</p>
                        </div>
                      )}
                      <FieldError errors={inventoryErrors?.boxId} />
                    </div>

                    <div>
                      <Label htmlFor="quick-bag">Bolsa <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                      <Input id="quick-bag" value={bagLabel} onChange={(event) => setBagLabel(event.target.value)} placeholder="Ej. Bolsa 12" className="mt-2" />
                      <p className="mt-1.5 text-xs text-muted-foreground">Déjalo vacío para guardar sin bolsa.</p>
                    </div>
                    <div>
                      <Label htmlFor="quick-quantity">{selectedProduct ? "Cantidad" : "Cantidad de piezas"}</Label>
                      <div className="mt-2 flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon" aria-label="Restar una unidad" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</Button>
                        <Input aria-invalid={Boolean(inventoryErrors?.quantity?.length)} id="quick-quantity" type="number" inputMode="numeric" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="text-center text-lg font-semibold" />
                        <Button type="button" variant="outline" size="icon" aria-label="Sumar una unidad" onClick={() => setQuantity((value) => value + 1)}>+</Button>
                      </div>
                      <FieldError errors={inventoryErrors?.quantity} />
                    </div>
                  </div>
                  {!selectedProduct ? <>
                    <h3 className="mt-7 text-h3 text-navy">Venta</h3>
                    <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="quick-sale-price">Precio de venta</Label>
                      <div className="mt-2 flex items-center gap-3"><Input aria-invalid={Boolean(errors.salePrice?.length)} id="quick-sale-price" inputMode="decimal" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} placeholder="1250.00" aria-describedby="quick-price-help" /><span className="font-semibold">MXN</span></div>
                      <p id="quick-price-help" className="mt-1 text-xs text-muted-foreground">Hasta dos decimales, sin comas. Si lo dejas vacío, se mostrará «Consultar precio».</p>
                      <FieldError errors={errors?.salePrice} />
                    </div>
                      <div className="sm:col-span-2"><Label htmlFor="quick-warranty">Garantía <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input aria-invalid={Boolean(errors.warranty?.length)} id="quick-warranty" value={warranty} onChange={(event) => setWarranty(event.target.value)} maxLength={240} placeholder="Ej. 30 días; sin garantía" className="mt-2" /><FieldError errors={errors.warranty} /></div>
                      <div className="sm:col-span-2"><p className="font-semibold">Disponibilidad: {Number.isInteger(quantity) && quantity > 0 ? getPublicAvailability(quantity).label : "Revisa la cantidad"}</p><p className="mt-1 text-small text-muted-foreground">Se calcula con las piezas disponibles del inventario.</p></div>
                    </div>
                    <h3 className="mt-7 text-h3 text-navy">Publicación</h3>
                    <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="quick-condition">Condición</Label>
                      <Select id="quick-condition" value={condition} onChange={(event) => setCondition(event.target.value as ProductCondition)} className="mt-2" aria-invalid={Boolean(errors?.condition)}>{Object.entries(productConditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
                      <FieldError errors={errors?.condition} />
                    </div>
                    <div>
                      <Label htmlFor="quick-status">Estado</Label><Select id="quick-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="mt-2"><option value="ACTIVE">Activo</option><option value="DRAFT">Borrador</option><option value="ARCHIVED">Archivado</option></Select>
                    </div>
                    <label className="flex min-h-11 items-center gap-3 self-end rounded-md border border-border p-3 text-small font-semibold"><input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} className="size-5 accent-primary" />Visible en el catálogo público</label>
                    {status !== "ACTIVE" ? <p role="status" className="text-small text-muted-foreground sm:col-span-2">Solo los productos activos pueden aparecer en el catálogo. Se guardará sin visibilidad pública.</p> : null}
                    </div>
                    <div className="mt-6 break-words rounded-md bg-card p-4 text-small" aria-label="Resumen del producto">
                      <p className="font-semibold">{title || `${selectedType?.name ?? ""} ${selectedBrand?.name ?? ""} ${partNumber || compatibilities[0]?.model || ""}`}</p>
                      <p className="mt-1">{quantity} pieza(s) · {selectedLocation?.breadcrumb ?? "Selecciona ubicación"} · {boxMode === "new" ? newBoxName || "Caja nueva" : boxes.find((box) => box.id === resolvedBoxId)?.name ?? "Selecciona caja"}{bagLabel ? ` · Bolsa: ${bagLabel}` : ""}</p>
                      <p className="mt-1">{salePrice ? `${formatMoney(salePrice)} MXN` : "Consultar precio"} · {productConditionLabels[condition]}</p>
                    </div>
                  </> : null}
                </section>
              ) : null}
            </div>

            <footer className="relative z-10 shrink-0 border-t border-border bg-card px-5 py-4 sm:px-7">
              {step === "create" ? (
                <div className="flex items-center justify-between gap-3">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => wizardStep === 1 ? close() : moveTo((wizardStep - 1) as WizardStep)}>{wizardStep === 1 ? "Cancelar" : "Atrás"}</Button>
                  {wizardStep < 5 ? <Button key="next-step" type="button" disabled={busy} onClick={(event) => { event.preventDefault(); continueNewProduct(); }}>Siguiente</Button> : <Button key="create-product" type="submit" isLoading={pending} loadingLabel="Agregando…" disabled={busy || locationEditor !== null}>Agregar producto</Button>}
                </div>
              ) : null}
              {step === "place" ? (
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-small text-muted-foreground">Estas existencias se agregarán aquí; las existencias en otras ubicaciones se conservan.</p>
                  <Button type="submit" isLoading={pending} loadingLabel="Agregando…" disabled={busy || locationEditor !== null || !resolvedLocationId || quantity < 1 || (boxMode === "existing" ? !resolvedBoxId : !newBoxCode.trim() || !newBoxName.trim())}>
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
