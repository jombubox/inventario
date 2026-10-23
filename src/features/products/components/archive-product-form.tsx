"use client";

import { useArchiveAction } from "@/features/archives/components/archive-feedback";

import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { archiveProductAction } from "@/features/products/server/actions";

export function ArchiveProductForm({ id, updatedAt }: { id: string; updatedAt: string }) {
  const [state, action] = useArchiveAction(archiveProductAction);

  return (
    <form action={action} onSubmit={(event) => { if (!window.confirm("¿Archivar este producto? Dejará de aparecer en el listado principal. Podrás restaurarlo desde Archivados.")) event.preventDefault(); }} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <FormFeedback state={state} />
      <SubmitButton variant="destructive" size="sm" pendingLabel="Archivando…">Archivar producto</SubmitButton>
    </form>
  );
}
