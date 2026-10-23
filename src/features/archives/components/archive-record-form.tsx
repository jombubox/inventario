"use client";
import { useArchiveAction } from "./archive-feedback";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import type { ArchiveCategory } from "@/features/archives/domain/archives";
import { archiveLocationAction, restoreArchivedAction } from "@/features/archives/server/actions";

export function ArchiveRecordForm({ id, updatedAt, category, archive = false }: {
  id: string; updatedAt: string; category: ArchiveCategory; archive?: boolean;
}) {
  const [state, action] = useArchiveAction(archive ? archiveLocationAction : restoreArchivedAction);
  return <form action={action} onSubmit={(event) => {
    if (archive && !window.confirm("¿Archivar esta ubicación? Dejará de aparecer en el listado principal. Podrás restaurarla desde Archivados.")) event.preventDefault();
  }} className="space-y-2">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="expectedUpdatedAt" value={updatedAt} /><input type="hidden" name="categoria" value={category} />
    <SubmitButton size="sm" variant={archive ? "destructive" : "primary"} pendingLabel={archive ? "Archivando…" : "Restaurando…"}>{archive ? "Archivar ubicación" : "Restaurar"}</SubmitButton>
    <FormFeedback state={state} />
  </form>;
}
