"use client";

import { useActionState } from "react";

import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createLocationAction,
  updateLocationAction,
} from "@/features/locations/server/actions";
import { initialMutationState } from "@/features/shared/domain/mutation-state";

type LocationOption = { id: string; breadcrumb: string };
type LocationValue = {
  id: string;
  code: string;
  name: string;
  type: "WAREHOUSE" | "ZONE" | "SHELF" | "BOX" | "BAG" | "OTHER";
  parentId: string | null;
  active: boolean;
  notes: string | null;
  updatedAt: string;
};

function LocationFields({ location, options }: { location?: LocationValue; options: LocationOption[] }) {
  const prefix = location?.id ?? "new";
  return (
    <>
      <div><Label htmlFor={`${prefix}-code`}>Código</Label><Input id={`${prefix}-code`} name="code" defaultValue={location?.code ?? ""} placeholder="C03" className="mt-2" required /></div>
      <div><Label htmlFor={`${prefix}-name`}>Nombre</Label><Input id={`${prefix}-name`} name="name" defaultValue={location?.name ?? ""} placeholder="Caja 03" className="mt-2" required /></div>
      <div><Label htmlFor={`${prefix}-type`}>Tipo</Label><Select id={`${prefix}-type`} name="type" defaultValue={location?.type ?? "BOX"} className="mt-2"><option value="WAREHOUSE">Almacén</option><option value="ZONE">Zona</option><option value="SHELF">Estante</option><option value="BOX">Caja</option><option value="BAG">Bolsa</option><option value="OTHER">Otro</option></Select></div>
      <div><Label htmlFor={`${prefix}-parent`}>Ubicación padre</Label><Select id={`${prefix}-parent`} name="parentId" defaultValue={location?.parentId ?? ""} className="mt-2"><option value="">Sin padre · ubicación raíz</option>{options.map((option) => <option key={option.id} value={option.id} disabled={option.id === location?.id}>{option.breadcrumb}</option>)}</Select></div>
      <div className="sm:col-span-2"><Label htmlFor={`${prefix}-notes`}>Notas</Label><Textarea id={`${prefix}-notes`} name="notes" defaultValue={location?.notes ?? ""} rows={2} className="mt-2" /></div>
      <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-border px-4 text-small font-semibold"><input type="checkbox" name="active" defaultChecked={location?.active ?? true} className="size-4 accent-primary" /> Ubicación activa</label>
    </>
  );
}

export function CreateLocationForm({ options }: { options: LocationOption[] }) {
  const [state, action] = useActionState(createLocationAction, initialMutationState);
  return <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate><LocationFields options={options} /><div className="sm:col-span-2 lg:col-span-3"><FormFeedback state={state} /></div><div className="sm:col-span-2 lg:col-span-3 flex justify-end"><SubmitButton pendingLabel="Creando…">Crear ubicación</SubmitButton></div></form>;
}

export function EditLocationForm({ location, options }: { location: LocationValue; options: LocationOption[] }) {
  const [state, action] = useActionState(updateLocationAction, initialMutationState);
  return <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate><input type="hidden" name="id" value={location.id} /><input type="hidden" name="expectedUpdatedAt" value={location.updatedAt} /><LocationFields location={location} options={options} /><div className="sm:col-span-2 lg:col-span-3"><FormFeedback state={state} /></div><div className="sm:col-span-2 lg:col-span-3 flex justify-end"><SubmitButton size="sm" pendingLabel="Actualizando…">Guardar ubicación</SubmitButton></div></form>;
}
