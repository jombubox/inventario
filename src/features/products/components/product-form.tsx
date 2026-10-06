"use client";

import { useActionState, useMemo, useState } from "react";

import { FieldError, FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CompatibleModelsField,
  type CompatibilityValue,
} from "@/features/products/components/compatible-models-field";
import { CreatableCatalogSelect } from "@/features/products/components/creatable-catalog-select";
import {
  ProductSerialFields,
  type SerialNumberValue,
} from "@/features/products/components/product-serial-fields";
import { buildProductTitle } from "@/features/products/domain/build-product-title";
import { buildCatalogIdentity } from "@/features/products/domain/catalog-identity";
import { CUSTOM_CATALOG_VALUE } from "@/features/products/domain/catalog-selection";
import { generateSku } from "@/features/products/domain/generate-sku";
import { productConditionLabels, type ProductCondition } from "@/features/products/domain/product-condition";
import {
  createProductAction,
  updateProductAction,
} from "@/features/products/server/actions";
import { initialMutationState } from "@/features/shared/domain/mutation-state";

type CatalogOption = { id: string; name: string; code: string };

type ProductFormValue = {
  id: string;
  sku: string;
  brandId: string;
  componentTypeId: string;
  partNumber: string | null;
  primarySerialNumber: string | null;
  secondarySerialNumbers: string[];
  title: string;
  description: string | null;
  salePrice: string | null;
  condition: ProductCondition | null;
  currency: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  isPublic: boolean;
  updatedAt: string;
  compatibilities: CompatibilityValue[];
};

export function ProductForm({
  brands,
  componentTypes,
  product,
}: {
  brands: CatalogOption[];
  componentTypes: CatalogOption[];
  product?: ProductFormValue;
}) {
  const action = product ? updateProductAction : createProductAction;
  const [state, formAction] = useActionState(action, initialMutationState);
  const [brandId, setBrandId] = useState(product?.brandId ?? brands[0]?.id ?? "");
  const [componentTypeId, setComponentTypeId] = useState(
    product?.componentTypeId ?? componentTypes[0]?.id ?? "",
  );
  const [customBrandName, setCustomBrandName] = useState("");
  const [customComponentTypeName, setCustomComponentTypeName] = useState("");
  const [partNumber, setPartNumber] = useState(product?.partNumber ?? "");
  const [primarySerialNumber, setPrimarySerialNumber] = useState(
    product?.primarySerialNumber ?? "",
  );
  const [secondarySerialNumbers, setSecondarySerialNumbers] = useState<SerialNumberValue[]>(
    () => (product?.secondarySerialNumbers ?? []).map((value, index) => ({
      id: `existing-${index}`,
      value,
    })),
  );
  const [compatibilities, setCompatibilities] = useState<CompatibilityValue[]>(
    product?.compatibilities ?? [],
  );
  const [modelSaving, setModelSaving] = useState(false);
  const [manualTitle, setManualTitle] = useState(product?.title ?? "");
  const [titleOverridden, setTitleOverridden] = useState(Boolean(product));

  const brand = useMemo(
    () => brandId === CUSTOM_CATALOG_VALUE && customBrandName.trim()
      ? {
          id: CUSTOM_CATALOG_VALUE,
          name: customBrandName.trim(),
          code: buildCatalogIdentity(customBrandName, "brand").code,
        }
      : brands.find((item) => item.id === brandId),
    [brandId, brands, customBrandName],
  );
  const componentType = useMemo(
    () => componentTypeId === CUSTOM_CATALOG_VALUE && customComponentTypeName.trim()
      ? {
          id: CUSTOM_CATALOG_VALUE,
          name: customComponentTypeName.trim(),
          code: buildCatalogIdentity(customComponentTypeName, "componentType").code,
        }
      : componentTypes.find((item) => item.id === componentTypeId),
    [componentTypeId, componentTypes, customComponentTypeName],
  );
  const firstModel = compatibilities[0]?.model ?? "";
  const suggestedTitle = useMemo(
    () =>
      brand && componentType
        ? buildProductTitle({
            componentType: componentType.name.toUpperCase(),
            partNumber,
            brand: brand.name.toUpperCase(),
            compatibleModel: firstModel,
          })
        : "",
    [brand, componentType, partNumber, firstModel],
  );
  const title = titleOverridden ? manualTitle : suggestedTitle;

  let skuPreview = product?.sku ?? "Agrega un número de parte o modelo compatible";
  if (!product && brand && componentType) {
    try {
      skuPreview = generateSku({
        brandCode: brand.code,
        componentCode: componentType.code,
        partNumber,
        compatibleModel: firstModel,
      });
    } catch {
      // The explanatory fallback remains visible until identity data is sufficient.
    }
  }

  return (
    <form action={formAction} className="space-y-7" noValidate>
      {product ? (
        <>
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="expectedUpdatedAt" value={product.updatedAt} />
        </>
      ) : null}
      <input type="hidden" name="compatibilities" value={JSON.stringify(compatibilities)} />
      <input type="hidden" name="primarySerialNumber" value={primarySerialNumber} />
      <input
        type="hidden"
        name="secondarySerialNumbers"
        value={JSON.stringify(secondarySerialNumbers.map(({ value }) => value))}
      />
      <FormFeedback state={state} />

      <section className="grid gap-5 rounded-md bg-card p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <CreatableCatalogSelect
          id="brandId"
          name="brandId"
          label="Marca"
          options={brands}
          value={brandId}
          onChange={setBrandId}
          customName={customBrandName}
          onCustomNameChange={setCustomBrandName}
          customFieldName="customBrandName"
          customLabel="Nombre de la nueva marca"
          addLabel="Agregar otra marca…"
          selectionErrors={state.fieldErrors?.brandId}
          customErrors={state.fieldErrors?.customBrandName}
        />
        <CreatableCatalogSelect
          id="componentTypeId"
          name="componentTypeId"
          label="Tipo de pieza"
          options={componentTypes}
          value={componentTypeId}
          onChange={setComponentTypeId}
          customName={customComponentTypeName}
          onCustomNameChange={setCustomComponentTypeName}
          customFieldName="customComponentTypeName"
          customLabel="Nombre del nuevo tipo de pieza"
          addLabel="Agregar tipo de pieza…"
          selectionErrors={state.fieldErrors?.componentTypeId}
          customErrors={state.fieldErrors?.customComponentTypeName}
        />
        <div>
          <Label htmlFor="partNumber">Número de parte</Label>
          <Input id="partNumber" name="partNumber" value={partNumber} onChange={(event) => setPartNumber(event.target.value)} placeholder="BN94-07820F" className="mt-2" />
          <FieldError errors={state.fieldErrors?.partNumber} />
        </div>
        <div>
          <span className="text-label font-semibold text-foreground">{product ? "SKU inmutable" : "Vista previa del SKU"}</span>
          <div className="mt-2 min-h-11 rounded-xl border border-primary/20 bg-primary-soft px-3 py-3 font-mono text-small font-semibold text-primary-active">
            {skuPreview}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">El servidor vuelve a generarlo y valida colisiones al guardar.</p>
        </div>
      </section>

      <section className="rounded-md bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <h2 className="text-h3">Números de serie del producto</h2>
          <p className="mt-1 text-small text-muted-foreground">
            Son identificadores del producto y permanecen separados del número de parte y del SKU.
          </p>
        </div>
        <ProductSerialFields
          idPrefix="product"
          primarySerialNumber={primarySerialNumber}
          onPrimarySerialNumberChange={setPrimarySerialNumber}
          secondarySerialNumbers={secondarySerialNumbers}
          onSecondarySerialNumbersChange={setSecondarySerialNumbers}
          primaryErrors={state.fieldErrors?.primarySerialNumber}
          secondaryErrors={state.fieldErrors?.secondarySerialNumbers}
        />
      </section>

      <section className="rounded-md bg-card p-5 shadow-sm sm:p-6">
        <CompatibleModelsField
          onBusyChange={setModelSaving}
          idPrefix="product"
          brands={brands}
          value={compatibilities}
          onChange={setCompatibilities}
          defaultBrandId={brandId === CUSTOM_CATALOG_VALUE ? brands[0]?.id ?? "" : brandId}
          errors={state.fieldErrors?.compatibilities}
        />
      </section>

      <section className="grid gap-5 rounded-md bg-card p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between gap-3"><Label htmlFor="title">Título administrativo</Label>{titleOverridden ? <button type="button" className="text-small font-semibold text-link hover:underline" onClick={() => setTitleOverridden(false)}>Usar sugerencia</button> : <span className="text-xs text-muted-foreground">Sugerencia automática</span>}</div>
          <Input id="title" name="title" value={title} onChange={(event) => { setTitleOverridden(true); setManualTitle(event.target.value); }} className="mt-2" />
          <FieldError errors={state.fieldErrors?.title} />
        </div>
        <div className="sm:col-span-2"><Label htmlFor="description">Descripción</Label><Textarea id="description" name="description" defaultValue={product?.description ?? ""} rows={4} className="mt-2" /></div>
        <div><Label htmlFor="salePrice">Precio de venta</Label><Input id="salePrice" name="salePrice" inputMode="decimal" defaultValue={product?.salePrice ?? ""} placeholder="0.00" className="mt-2" /><FieldError errors={state.fieldErrors?.salePrice} /></div>
        <div><Label htmlFor="currency">Moneda</Label><Select id="currency" name="currency" defaultValue={product?.currency ?? "MXN"} className="mt-2"><option value="MXN">MXN · Peso mexicano</option></Select></div>
        <div><Label htmlFor="product-condition">Condición</Label><Select id="product-condition" name="condition" defaultValue={product ? product.condition ?? "" : "NEW"} className="mt-2" aria-invalid={Boolean(state.fieldErrors?.condition)} aria-describedby="product-condition-help">{product?.condition === null ? <option value="">Sin especificar</option> : null}{Object.entries(productConditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><p id="product-condition-help" className="mt-1.5 text-xs text-muted-foreground">Indica si el producto es nuevo o usado.</p><FieldError errors={state.fieldErrors?.condition} /></div>
        <div><Label htmlFor="status">Estado</Label><Select id="status" name="status" defaultValue={product?.status ?? "DRAFT"} className="mt-2"><option value="DRAFT">Borrador</option><option value="ACTIVE">Activo</option><option value="ARCHIVED">Archivado</option></Select></div>
        <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-border px-4 text-small font-semibold"><input type="checkbox" name="isPublic" defaultChecked={product?.isPublic ?? false} className="size-4 accent-primary" /> Visible en el catálogo público</label>
      </section>

      <div className="flex justify-end"><SubmitButton disabled={modelSaving} pendingLabel={product ? "Actualizando…" : "Creando…"}>{product ? "Guardar cambios" : "Crear producto"}</SubmitButton></div>
    </form>
  );
}
