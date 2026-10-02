"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveQuickAddLocationAction } from "@/features/locations/server/actions";
import type { listQuickAddOptions } from "@/features/inventory/data/quick-add-queries";

export function QuickAddLocationEditor({ location, onSaved, onCancel, onBusyChange, onRefreshed }: {
  location?: { id: string; name: string; updatedAt?: string };
  onSaved: (options: Awaited<ReturnType<typeof listQuickAddOptions>>, id: string) => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
  onRefreshed: (options: Awaited<ReturnType<typeof listQuickAddOptions>>) => void;
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const save = () => {
    setError("");
    onBusyChange(true);
    startTransition(async () => {
      try {
        const body = new FormData();
        body.set("mode", location ? "edit" : "create");
        body.set("name", name);
        body.set("code", code);
        if (location) {
          body.set("id", location.id);
          body.set("expectedUpdatedAt", location.updatedAt ?? "");
        }
        const result = await saveQuickAddLocationAction(body);
        if (result.options) onRefreshed(result.options);
        if (result.status !== "success" || !result.options || !result.selectedLocationId) {
          setError(Object.values(result.fieldErrors ?? {}).flat().join(" ") || result.message || "No fue posible guardar la ubicación.");
          return;
        }
        onSaved(result.options, result.selectedLocationId);
      } catch {
        setError("No fue posible guardar la ubicación. Inténtalo de nuevo.");
      } finally {
        onBusyChange(false);
      }
    });
  };
  return <section aria-label={location ? "Editar ubicación" : "Nueva ubicación"} className="mt-3 space-y-3 rounded-md bg-primary-soft/30 p-4">
    <h4 className="font-semibold">{location ? "Editar ubicación" : "Nueva ubicación"}</h4>
    {!location ? <div><Label htmlFor="quick-location-code">Código de ubicación</Label><Input id="quick-location-code" value={code} onChange={(event) => setCode(event.target.value)} className="mt-2" placeholder="Ej. NORTE" /></div> : null}
    <div><Label htmlFor="quick-location-name">Nombre de ubicación</Label><Input id="quick-location-name" value={name} onChange={(event) => setName(event.target.value)} className="mt-2" /></div>
    {error ? <p role="alert" className="text-small text-danger">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={save} isLoading={pending} disabled={!name.trim() || (!location && !code.trim())}>Guardar ubicación</Button><Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>Cancelar</Button></div>
  </section>;
}
