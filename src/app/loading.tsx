import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background">
      <div className="flex items-center gap-3 text-small text-muted-foreground">
        <Spinner label="Cargando Jombubox" className="text-primary" />
        Preparando Jombubox…
      </div>
    </main>
  );
}
