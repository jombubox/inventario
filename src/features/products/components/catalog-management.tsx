"use client";

import { useActionState } from "react";

import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  archiveBrandAction,
  archiveComponentTypeAction,
  createBrandAction,
  createComponentTypeAction,
  updateBrandAction,
  updateComponentTypeAction,
} from "@/features/products/server/catalog-actions";
import { initialMutationState } from "@/features/shared/domain/mutation-state";

type CatalogKind = "brand" | "componentType";

type CatalogEntry = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  updatedAt: Date;
  productCount: number;
  compatibilityCount?: number;
};

export function CreateCatalogEntryForm({ kind }: { kind: CatalogKind }) {
  const action = kind === "brand" ? createBrandAction : createComponentTypeAction;
  const [state, formAction] = useActionState(action, initialMutationState);
  const noun = kind === "brand" ? "marca" : "tipo de pieza";
  const nameLabel = kind === "brand"
    ? "Nombre de la nueva marca"
    : "Nombre del nuevo tipo de pieza";
  return (
    <form
      action={formAction}
      className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      noValidate
    >
      <div>
        <Label htmlFor={`new-${kind}`}>{nameLabel}</Label>
        <Input
          id={`new-${kind}`}
          name="name"
          className="mt-2"
          maxLength={120}
          autoComplete="off"
          required
        />
      </div>
      <SubmitButton pendingLabel="Guardando…">Crear {noun}</SubmitButton>
      <div className="sm:col-span-2"><FormFeedback state={state} /></div>
    </form>
  );
}

export function CatalogEntryEditor({ entry, kind }: { entry: CatalogEntry; kind: CatalogKind }) {
  const updateAction = kind === "brand" ? updateBrandAction : updateComponentTypeAction;
  const archiveAction = kind === "brand" ? archiveBrandAction : archiveComponentTypeAction;
  const [updateState, updateFormAction] = useActionState(updateAction, initialMutationState);
  const [archiveState, archiveFormAction] = useActionState(archiveAction, initialMutationState);
  const noun = kind === "brand" ? "marca" : "tipo de pieza";
  const usage = entry.productCount + (entry.compatibilityCount ?? 0);

  return (
    <article className="rounded-md bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-navy">{entry.name}</h2>
            <Badge>{entry.code}</Badge>
            <Badge variant={entry.active ? "success" : "warning"}>
              {entry.active
                ? kind === "brand" ? "Activa" : "Activo"
                : kind === "brand" ? "Inactiva" : "Inactivo"}
            </Badge>
          </div>
          <p className="mt-1 text-small text-muted-foreground">
            {usage === 0
              ? "Sin productos relacionados"
              : `${usage} uso(s) en productos${entry.compatibilityCount ? " y compatibilidades" : ""}`}
          </p>
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer py-2 text-small font-semibold text-link">
          Editar {noun}
        </summary>
        <form
          action={updateFormAction}
          className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          noValidate
        >
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="expectedUpdatedAt" value={entry.updatedAt.toISOString()} />
          <div>
            <Label htmlFor={`${kind}-${entry.id}`}>Nombre</Label>
            <Input id={`${kind}-${entry.id}`} name="name" defaultValue={entry.name} className="mt-2" required />
          </div>
          <SubmitButton size="sm" pendingLabel="Guardando…">Guardar cambios</SubmitButton>
          <div className="sm:col-span-2"><FormFeedback state={updateState} /></div>
        </form>
      </details>

      {entry.active ? (
        <form
          action={archiveFormAction}
          className="mt-4 border-t border-border/60 pt-4"
          onSubmit={(event) => {
            if (!window.confirm(`¿Desactivar ${kind === "brand" ? "la marca" : "el tipo de pieza"} ${entry.name}?`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="expectedUpdatedAt" value={entry.updatedAt.toISOString()} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-small text-muted-foreground">
              {usage > 0
                ? `No se puede desactivar mientras tenga ${usage} uso(s).`
                : `Puedes desactivar ${kind === "brand" ? "la marca" : "el tipo de pieza"} sin borrar su historial.`}
            </p>
            <Button type="submit" variant="destructive" size="sm">Desactivar {noun}</Button>
          </div>
          <FormFeedback state={archiveState} />
        </form>
      ) : null}
    </article>
  );
}
