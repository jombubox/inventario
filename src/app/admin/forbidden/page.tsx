import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminPageSession } from "@/features/auth/server/authorization";

export default async function ForbiddenPage() {
  await requireAdminPageSession();

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center">
      <Card className="w-full">
        <CardContent className="p-8 text-center sm:p-12">
          <p className="text-label uppercase tracking-[0.14em] text-primary">Acceso restringido</p>
          <h1 className="mt-3 text-h2 text-navy">No tienes permiso para abrir esta sección.</h1>
          <p className="mx-auto mt-4 max-w-lg text-body text-muted-foreground">
            Tu sesión sigue activa. Si necesitas este acceso, solicita a un administrador que revise tu rol.
          </p>
          <Link href="/admin" className={buttonStyles({ className: "mt-7" })}>
            Volver al dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
