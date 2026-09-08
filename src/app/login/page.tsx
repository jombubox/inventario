import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Brand } from "@/components/layout/brand";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";
import { getAuthenticatedUser } from "@/features/auth/server/authorization";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Acceso administrativo seguro a JombuBox.",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  if (await getAuthenticatedUser()) redirect("/admin");

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-navy px-5 py-10">
      <div className="absolute inset-0 opacity-20 surface-grid" aria-hidden="true" />
      <div className="relative w-full max-w-md">
        <div className="mx-auto mb-8 flex w-fit justify-center rounded-xl bg-white px-5 py-3 shadow-lg shadow-black/20">
          <Brand admin />
        </div>
        <Card className="border-white/10 shadow-2xl shadow-black/25">
          <CardContent className="p-6 sm:p-8">
            <p className="text-label uppercase tracking-[0.16em] text-primary">Acceso interno</p>
            <h1 className="mt-2 text-h2 text-navy">Bienvenido a JombuBox</h1>
            <p className="mt-2 text-small text-muted-foreground">
              Inicia sesión para gestionar productos, inventario y ubicaciones.
            </p>
            <div className="mt-7">
              <LoginForm />
            </div>
          </CardContent>
        </Card>
        <p className="mt-5 text-center text-small text-white/60">
          No existe registro público. Solicita acceso a un administrador.
        </p>
      </div>
    </main>
  );
}
