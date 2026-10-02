"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-navy/65">
    <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card p-4">
      <h2 id={titleId} className="min-w-0 break-words text-h3">{title}</h2>
      <Button type="button" variant="ghost" size="icon" aria-label="Cerrar ventana" onClick={onClose}>×</Button>
    </div>
    <div className="p-4 sm:p-6">{children}</div>
  </dialog>;
}
