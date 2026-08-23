"use client";

import { useActionState } from "react";

import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { archiveProductAction } from "@/features/products/server/actions";
import { initialMutationState } from "@/features/shared/domain/mutation-state";

export function ArchiveProductForm({ id, updatedAt }: { id: string; updatedAt: string }) {
  const [state, action] = useActionState(archiveProductAction, initialMutationState);

  return (
    <form action={action} onSubmit={(event) => { if (!window.confirm("¿Archivar este producto? Dejará de ser público.")) event.preventDefault(); }} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <FormFeedback state={state} />
      <SubmitButton variant="destructive" size="sm" pendingLabel="Archivando…">Archivar producto</SubmitButton>
    </form>
  );
}
