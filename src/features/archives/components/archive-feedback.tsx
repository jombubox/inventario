"use client";

import { createContext, useActionState, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { initialMutationState, type MutationState } from "@/features/shared/domain/mutation-state";

const ArchiveFeedbackContext = createContext<(message: string) => void>(() => {});

// Keep success feedback mounted when a revalidated list removes the acted-on row.
export function ArchiveFeedback({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  return <ArchiveFeedbackContext value={setMessage}>
    {message ? <div role="status" className="mb-5 flex items-center justify-between gap-3 rounded-md bg-card p-4 text-small shadow-sm"><p>{message}</p><Button variant="ghost" size="sm" aria-label="Cerrar confirmación" onClick={() => setMessage("")}>Cerrar</Button></div> : null}
    {children}
  </ArchiveFeedbackContext>;
}

export function useArchiveAction(action: (state: MutationState, data: FormData) => Promise<MutationState>) {
  const notify = useContext(ArchiveFeedbackContext);
  return useActionState(async (state: MutationState, data: FormData) => {
    const result = await action(state, data);
    if (result.status === "success" && result.message) notify(result.message);
    return result;
  }, initialMutationState);
}
