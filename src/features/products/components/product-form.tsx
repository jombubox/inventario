"use client";

import { useActionState, useMemo, useState } from "react";

import { FieldError, FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildProductTitle } from "@/features/products/domain/build-product-title";
import { generateSku } from "@/features/products/domain/generate-sku";
import {
  createProductAction,
  updateProductAction,
} from "@/features/products/server/actions";
import { initialMutationState } from "@/features/shared/domain/mutation-state";

type CatalogOption = { id: string; name: string; code: string };
type CompatibilityValue = { brandId: string; model: string; notes?: string | null };

type ProductFormValue = {
  id: string;
  sku: string;
  brandId: string;
  componentTypeId: string;
  partNumber: string | null;
  title: string;
  description: string | null;
  salePrice: string | null;
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
  const [partNumber, setPartNumber] = useState(product?.partNumber ?? "");
  const [compatibilities, setCompatibilities] = useState<CompatibilityValue[]>(
    product?.compatibilities ?? [],
  );
  const [manualTitle, setManualTitle] = useState(product?.title ?? "");
  const [titleOverridden, setTitleOverridden] = useState(Boolean(product));

  const brand = brands.find((item) => item.id === brandId);
  const componentType = componentTypes.find((item) => item.id === componentTypeId);
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

  const updateCompatibility = (
    index: number,
    field: keyof CompatibilityValue,
    value: string,
  ) => {
    setCompatibilities((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  return (
    <form action={formAction} className="space-y-7" noValidate>
      {product ? (
        <>
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="expectedUpdatedAt" value={product.updatedAt} />
        </>
      ) : null}
      <input type="hidden" name="compatibilities" value={JSON.stringify(compatibilities)} />
      <FormFeedback state={state} />

      <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 sm:p-6">
        <div>
          <Label htmlFor="brandId">Marca</Label>
          <Select id="brandId" name="brandId" value={brandId} onChange={(event) => setBrandId(event.target.value)} className="mt-2">
            {brands.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}
          </Select>
          <FieldError errors={state.fieldErrors?.brandId} />
        </div>
        <div>
          <Label htmlFor="componentTypeId">Tipo de componente</Label>
          <Select id="componentTypeId" name="componentTypeId" value={componentTypeId} onChange={(event) => setComponentTypeId(event.target.value)} className="mt-2">
            {componentTypes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}
          </Select>
          <FieldError errors={state.fieldErrors?.componentTypeId} />
        </div>
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

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-h3">Compatibilidades</h2><p className="mt-1 text-small text-muted-foreground">Agrega una marca y modelo por cada televisor compatible.</p></div>
          <Button type="button" variant="outline" size="sm" onClick={() => setCompatibilities((items) => [...items, { brandId: brandId || brands[0]?.id || "", model: "", notes: "" }])}>Agregar modelo</Button>
        </div>
        <div className="mt-5 space-y-3">
          {compatibilities.length === 0 ? <p className="rounded-xl bg-muted px-4 py-3 text-small text-muted-foreground">Sin compatibilidades. Si tampoco existe número de parte, agrega un modelo para generar el SKU.</p> : null}
          {compatibilities.map((item, index) => (
            <div key={`${index}-${item.brandId}`} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[0.8fr_1fr_1fr_auto]">
              <div><Label htmlFor={`compat-brand-${index}`}>Marca</Label><Select id={`compat-brand-${index}`} value={item.brandId} onChange={(event) => updateCompatibility(index, "brandId", event.target.value)} className="mt-2">{brands.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</Select></div>
              <div><Label htmlFor={`compat-model-${index}`}>Modelo</Label><Input id={`compat-model-${index}`} value={item.model} onChange={(event) => updateCompatibility(index, "model", event.target.value)} placeholder="UN58H5200SXZX" className="mt-2" /></div>
              <div><Label htmlFor={`compat-notes-${index}`}>Notas</Label><Input id={`compat-notes-${index}`} value={item.notes ?? ""} onChange={(event) => updateCompatibility(index, "notes", event.target.value)} className="mt-2" /></div>
              <Button type="button" variant="ghost" size="sm" className="self-end text-danger" onClick={() => setCompatibilities((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Quitar</Button>
            </div>
          ))}
        </div>
        <FieldError errors={state.fieldErrors?.compatibilities} />
      </section>

      <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between gap-3"><Label htmlFor="title">Título administrativo</Label>{titleOverridden ? <button type="button" className="text-small font-semibold text-primary hover:underline" onClick={() => setTitleOverridden(false)}>Usar sugerencia</button> : <span className="text-xs text-muted-foreground">Sugerencia automática</span>}</div>
          <Input id="title" name="title" value={title} onChange={(event) => { setTitleOverridden(true); setManualTitle(event.target.value); }} className="mt-2" />
          <FieldError errors={state.fieldErrors?.title} />
        </div>
        <div className="sm:col-span-2"><Label htmlFor="description">Descripción</Label><Textarea id="description" name="description" defaultValue={product?.description ?? ""} rows={4} className="mt-2" /></div>
        <div><Label htmlFor="salePrice">Precio de venta</Label><Input id="salePrice" name="salePrice" inputMode="decimal" defaultValue={product?.salePrice ?? ""} placeholder="0.00" className="mt-2" /><FieldError errors={state.fieldErrors?.salePrice} /></div>
        <div><Label htmlFor="currency">Moneda</Label><Select id="currency" name="currency" defaultValue={product?.currency ?? "MXN"} className="mt-2"><option value="MXN">MXN · Peso mexicano</option></Select></div>
        <div><Label htmlFor="status">Estado</Label><Select id="status" name="status" defaultValue={product?.status ?? "DRAFT"} className="mt-2"><option value="DRAFT">Borrador</option><option value="ACTIVE">Activo</option><option value="ARCHIVED">Archivado</option></Select></div>
        <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-border px-4 text-small font-semibold"><input type="checkbox" name="isPublic" defaultChecked={product?.isPublic ?? false} className="size-4 accent-primary" /> Visible en el catálogo público</label>
      </section>

      <div className="flex justify-end"><SubmitButton pendingLabel={product ? "Actualizando…" : "Creando…"}>{product ? "Guardar cambios" : "Crear producto"}</SubmitButton></div>
    </form>
  );
}
