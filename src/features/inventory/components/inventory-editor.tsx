"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { InventoryRowActions, type InventoryRowValue } from "./inventory-forms";

type LocationOption = { id: string; code: string; name: string; breadcrumb: string };

export function InventoryEditor({ item, sku, title, inventoryCode, locations }: {
  item: InventoryRowValue; sku: string; title: string; inventoryCode: string; locations: LocationOption[];
}) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="outline" className="w-full lg:w-auto" onClick={() => setOpen(true)} aria-label={`Editar inventario ${sku}`}>Editar</Button>
    {open ? <Modal title="Editar inventario" onClose={() => setOpen(false)}>
      <p className="break-words font-semibold">{title}</p>
      <p className="mt-1 break-all font-mono text-small text-link">{sku}</p>
      <p className="mb-5 mt-1 text-xs text-muted-foreground">Registro {inventoryCode}</p>
      <InventoryRowActions item={item} locations={locations} />
    </Modal> : null}
  </>;
}
