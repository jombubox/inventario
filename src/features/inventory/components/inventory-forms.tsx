"use client";

import { useActionState } from "react";

import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  adjustInventoryAction,
  createInventoryAction,
  moveInventoryAction,
  stockMovementAction,
  updateInventoryDetailsAction,
} from "@/features/inventory/server/actions";
import { initialMutationState } from "@/features/shared/domain/mutation-state";

type ProductOption = { id: string; sku: string; title: string };
type LocationOption = { id: string; code: string; name: string; breadcrumb: string };

const conditionOptions = [
  ["NEW", "Nuevo"],
  ["USED_EXCELLENT", "Usado · excelente"],
  ["USED_GOOD", "Usado · bueno"],
  ["USED_FAIR", "Usado · regular"],
  ["FOR_PARTS", "Para partes"],
  ["UNKNOWN", "Sin clasificar"],
] as const;

const statusOptions = [
  ["AVAILABLE", "Disponible"],
  ["RESERVED", "Reservado"],
  ["SOLD", "Vendido"],
  ["DAMAGED", "Dañado"],
  ["SCRAPPED", "Desechado"],
] as const;

export function CreateInventoryForm({ products, locations }: { products: ProductOption[]; locations: LocationOption[] }) {
  const [state, action] = useActionState(createInventoryAction, initialMutationState);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" noValidate>
      <div className="sm:col-span-2"><Label htmlFor="new-product">Producto</Label><Select id="new-product" name="productId" className="mt-2" required><option value="">Selecciona un producto</option>{products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.title}</option>)}</Select></div>
      <div className="sm:col-span-2"><Label htmlFor="new-location">Ubicación</Label><Select id="new-location" name="locationId" className="mt-2"><option value="">Ubicación pendiente</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.breadcrumb}</option>)}</Select></div>
      <div><Label htmlFor="new-quantity">Cantidad inicial</Label><Input id="new-quantity" name="quantity" type="number" min="1" step="1" defaultValue="1" className="mt-2" /></div>
      <div><Label htmlFor="new-condition">Condición</Label><Select id="new-condition" name="condition" defaultValue="UNKNOWN" className="mt-2">{conditionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
      <div><Label htmlFor="new-status">Estado</Label><Select id="new-status" name="status" defaultValue="AVAILABLE" className="mt-2"><option value="AVAILABLE">Disponible</option><option value="RESERVED">Reservado</option><option value="DAMAGED">Dañado</option></Select></div>
      <div><Label htmlFor="new-acquired">Fecha de adquisición</Label><Input id="new-acquired" name="acquiredAt" type="date" className="mt-2" /></div>
      <div><Label htmlFor="new-source">Origen</Label><Input id="new-source" name="acquisitionSource" className="mt-2" /></div>
      <div><Label htmlFor="new-cost">Costo de compra</Label><Input id="new-cost" name="purchaseCost" inputMode="decimal" placeholder="0.00" className="mt-2" /></div>
      <div><Label htmlFor="new-bag">N° Bolsa legacy</Label><Input id="new-bag" name="legacyBagNumber" className="mt-2" /></div>
      <div><Label htmlFor="new-legacy-location">Código legacy</Label><Input id="new-legacy-location" name="legacyLocationCode" placeholder="J1B1" className="mt-2" /></div>
      <div className="sm:col-span-2 lg:col-span-4"><Label htmlFor="new-notes">Notas</Label><Textarea id="new-notes" name="notes" rows={3} className="mt-2" /></div>
      <div className="sm:col-span-2 lg:col-span-4"><FormFeedback state={state} /></div>
      <div className="sm:col-span-2 lg:col-span-4 flex justify-end"><SubmitButton pendingLabel="Creando inventario…">Crear existencia</SubmitButton></div>
    </form>
  );
}

type InventoryRowValue = {
  id: string;
  quantity: number;
  condition: (typeof conditionOptions)[number][0];
  status: (typeof statusOptions)[number][0];
  locationId: string | null;
  acquiredAt: string | null;
  acquisitionSource: string | null;
  purchaseCost: string | null;
  notes: string | null;
  legacyBagNumber: string | null;
  legacyLocationCode: string | null;
  updatedAt: string;
};

export function InventoryRowActions({ item, locations }: { item: InventoryRowValue; locations: LocationOption[] }) {
  const [moveState, moveAction] = useActionState(moveInventoryAction, initialMutationState);
  const [adjustState, adjustAction] = useActionState(adjustInventoryAction, initialMutationState);
  const [detailsState, detailsAction] = useActionState(updateInventoryDetailsAction, initialMutationState);
  const [inState, inAction] = useActionState(stockMovementAction, initialMutationState);
  const [outState, outAction] = useActionState(stockMovementAction, initialMutationState);

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <form action={inAction} className="space-y-3 rounded-xl border border-border p-4">
        <input type="hidden" name="id" value={item.id} /><h3 className="font-semibold text-navy">Entrada o devolución</h3>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor={`in-type-${item.id}`}>Operación</Label><Select id={`in-type-${item.id}`} name="type" className="mt-2"><option value="IN">Entrada</option><option value="RETURN">Devolución</option></Select></div><div><Label htmlFor={`in-quantity-${item.id}`}>Cantidad</Label><Input id={`in-quantity-${item.id}`} name="quantity" type="number" min="1" step="1" defaultValue="1" className="mt-2" /></div></div>
        <div><Label htmlFor={`in-status-${item.id}`}>Estado resultante</Label><Select id={`in-status-${item.id}`} name="resultingStatus" className="mt-2"><option value="AVAILABLE">Disponible</option><option value="RESERVED">Reservado</option><option value="DAMAGED">Dañado</option></Select></div>
        <div><Label htmlFor={`in-reason-${item.id}`}>Motivo</Label><Input id={`in-reason-${item.id}`} name="reason" className="mt-2" required /></div>
        <FormFeedback state={inState} /><SubmitButton size="sm" pendingLabel="Registrando…">Registrar entrada</SubmitButton>
      </form>

      <form action={outAction} className="space-y-3 rounded-xl border border-border p-4">
        <input type="hidden" name="id" value={item.id} /><h3 className="font-semibold text-navy">Salida o venta</h3>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor={`out-type-${item.id}`}>Operación</Label><Select id={`out-type-${item.id}`} name="type" className="mt-2"><option value="OUT">Salida</option><option value="SALE">Venta</option></Select></div><div><Label htmlFor={`out-quantity-${item.id}`}>Cantidad</Label><Input id={`out-quantity-${item.id}`} name="quantity" type="number" min="1" max={item.quantity} step="1" defaultValue="1" className="mt-2" /></div></div>
        <div><Label htmlFor={`out-status-${item.id}`}>Estado si llega a cero</Label><Select id={`out-status-${item.id}`} name="resultingStatus" className="mt-2"><option value="SOLD">Vendido</option><option value="SCRAPPED">Desechado</option></Select></div>
        <div><Label htmlFor={`out-reason-${item.id}`}>Motivo</Label><Input id={`out-reason-${item.id}`} name="reason" className="mt-2" required /></div>
        <FormFeedback state={outState} /><SubmitButton size="sm" pendingLabel="Registrando…">Registrar salida</SubmitButton>
      </form>
      <form action={moveAction} onSubmit={(event) => { if (!window.confirm("¿Confirmas el cambio de ubicación?")) event.preventDefault(); }} className="space-y-3 rounded-xl border border-border p-4">
        <input type="hidden" name="id" value={item.id} /><h3 className="font-semibold text-navy">Mover ubicación</h3>
        <div><Label htmlFor={`move-location-${item.id}`}>Destino</Label><Select id={`move-location-${item.id}`} name="toLocationId" className="mt-2" required><option value="">Selecciona destino</option>{locations.map((location) => <option key={location.id} value={location.id} disabled={location.id === item.locationId}>{location.breadcrumb}</option>)}</Select></div>
        <div><Label htmlFor={`move-reason-${item.id}`}>Motivo</Label><Input id={`move-reason-${item.id}`} name="reason" className="mt-2" required /></div>
        <FormFeedback state={moveState} /><SubmitButton size="sm" pendingLabel="Moviendo…">Mover inventario</SubmitButton>
      </form>

      <form action={adjustAction} className="space-y-3 rounded-xl border border-border p-4">
        <input type="hidden" name="id" value={item.id} /><h3 className="font-semibold text-navy">Ajustar cantidad</h3>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor={`quantity-${item.id}`}>Nueva cantidad</Label><Input id={`quantity-${item.id}`} name="newQuantity" type="number" min="0" step="1" defaultValue={item.quantity} className="mt-2" /></div><div><Label htmlFor={`status-${item.id}`}>Estado</Label><Select id={`status-${item.id}`} name="newStatus" defaultValue={item.status} className="mt-2">{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div></div>
        <div><Label htmlFor={`adjust-reason-${item.id}`}>Motivo</Label><Input id={`adjust-reason-${item.id}`} name="reason" className="mt-2" required /></div>
        <FormFeedback state={adjustState} /><SubmitButton size="sm" pendingLabel="Ajustando…">Registrar ajuste</SubmitButton>
      </form>

      <form action={detailsAction} className="space-y-3 rounded-xl border border-border p-4">
        <input type="hidden" name="id" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={item.updatedAt} /><h3 className="font-semibold text-navy">Datos físicos</h3>
        <div><Label htmlFor={`condition-${item.id}`}>Condición</Label><Select id={`condition-${item.id}`} name="condition" defaultValue={item.condition} className="mt-2">{conditionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor={`acquired-${item.id}`}>Adquisición</Label><Input id={`acquired-${item.id}`} name="acquiredAt" type="date" defaultValue={item.acquiredAt ?? ""} className="mt-2" /></div><div><Label htmlFor={`cost-${item.id}`}>Costo</Label><Input id={`cost-${item.id}`} name="purchaseCost" defaultValue={item.purchaseCost ?? ""} className="mt-2" /></div></div>
        <div><Label htmlFor={`source-${item.id}`}>Origen</Label><Input id={`source-${item.id}`} name="acquisitionSource" defaultValue={item.acquisitionSource ?? ""} className="mt-2" /></div>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor={`bag-${item.id}`}>N° Bolsa</Label><Input id={`bag-${item.id}`} name="legacyBagNumber" defaultValue={item.legacyBagNumber ?? ""} className="mt-2" /></div><div><Label htmlFor={`legacy-${item.id}`}>Código legacy</Label><Input id={`legacy-${item.id}`} name="legacyLocationCode" defaultValue={item.legacyLocationCode ?? ""} className="mt-2" /></div></div>
        <div><Label htmlFor={`notes-${item.id}`}>Notas</Label><Textarea id={`notes-${item.id}`} name="notes" defaultValue={item.notes ?? ""} rows={2} className="mt-2" /></div>
        <FormFeedback state={detailsState} /><SubmitButton size="sm" pendingLabel="Actualizando…">Actualizar datos</SubmitButton>
      </form>
    </div>
  );
}
