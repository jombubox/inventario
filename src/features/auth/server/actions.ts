"use server";

import { redirect } from "next/navigation";

import {
  createAdminSession,
  logout,
  validateAdminCredentials,
} from "@/features/auth/server/admin-auth";
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
    if (!await validateAdminCredentials(parsed.data.email, parsed.data.password)) {
      return { error: "Correo o contraseña incorrectos." };
    }

    await createAdminSession();
  } catch {
    return { error: "Correo o contraseña incorrectos." };
  }

  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await logout();
}
