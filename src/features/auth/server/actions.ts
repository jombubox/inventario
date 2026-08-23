"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { loginInputSchema } from "@/validators/auth";

export type AuthActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginInputSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const response = await auth.api.signInEmail({
      body: parsed.data,
      headers: await headers(),
    });

    if (!response.user.active) {
      await auth.api.signOut({ headers: await headers() });
      return { error: "Tu cuenta está desactivada. Contacta a un administrador." };
    }
  } catch (error) {
    if (error instanceof APIError && error.status === "TOO_MANY_REQUESTS") {
      return { error: "Demasiados intentos. Espera un minuto antes de volver a intentar." };
    }

    return { error: "Correo o contraseña incorrectos." };
  }

  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
