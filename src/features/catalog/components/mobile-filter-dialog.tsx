"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Button, buttonStyles } from "@/components/ui/button";

type MobileFilterDialogProps = {
  activeCount: number;
  children: ReactNode;
};

export function MobileFilterDialog({ activeCount, children }: MobileFilterDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const closeOnBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener("click", closeOnBackdrop);
    return () => dialog.removeEventListener("click", closeOnBackdrop);
  }, []);

  return (
    <div className="lg:hidden">
      <Button variant="outline" onClick={() => dialogRef.current?.showModal()}>
        Filtros
        {activeCount > 0 ? (
          <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs text-white">
            {activeCount}
          </span>
        ) : null}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="mobile-filter-title"
        className="m-0 ml-auto h-dvh max-h-none w-[min(92vw,25rem)] max-w-none border-0 bg-card p-0 text-foreground shadow-2xl backdrop:bg-navy/45 open:flex open:flex-col"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="mobile-filter-title" className="text-h3 text-navy">
            Filtrar catálogo
          </h2>
          <button
            type="button"
            className={buttonStyles({ variant: "ghost", size: "icon" })}
            onClick={() => dialogRef.current?.close()}
            aria-label="Cerrar filtros"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </dialog>
    </div>
  );
}

