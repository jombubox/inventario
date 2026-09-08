"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  createAdminSession,
  deleteAdminSession,
} from "@/features/auth/server/admin-session";
import {
  InvalidEnvAdminConfigurationError,
  validateAdminCredentials,
} from "@/features/auth/server/env-admin";
import {
  clearLoginFailures,
  isLoginAttemptAllowed,
  recordLoginFailure,
} from "@/features/auth/server/login-rate-limit";
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

  const requestHeaders = await headers();
  if (!isLoginAttemptAllowed(requestHeaders)) {
    return { error: "Demasiados intentos. Espera un minuto antes de volver a intentar." };
  }

  try {
    if (!validateAdminCredentials(parsed.data.email, parsed.data.password)) {
      recordLoginFailure(requestHeaders);
      return { error: "Correo o contraseña incorrectos." };
    }

    await createAdminSession();
    clearLoginFailures(requestHeaders);
  } catch (error) {
    if (error instanceof InvalidEnvAdminConfigurationError) {
      console.error("ENV admin authentication is not configured.", {
        fields: error.fields,
      });
    }
    return { error: "Correo o contraseña incorrectos." };
  }

  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await deleteAdminSession();
  redirect("/login");
}
