import { Brand } from "@/components/layout/brand";

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <Brand className="origin-left scale-90" />
        <p className="text-small text-muted-foreground">Catálogo público de inventario técnico.</p>
      </div>
    </footer>
  );
}

