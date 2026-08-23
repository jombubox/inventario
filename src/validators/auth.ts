import { z } from "zod";

import { userRoleValues } from "@/features/auth/domain/permissions";
import { requiredDisplayText } from "@/validators/shared";

export const loginInputSchema = z.object({
  email: z.email("Ingresa un correo válido.").transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Ingresa tu contraseña.").max(128),
});

export const createUserInputSchema = z.object({
  name: requiredDisplayText,
  email: z.email("Ingresa un correo válido.").transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(12, "La contraseña debe tener al menos 12 caracteres.")
    .max(128),
  role: z.enum(userRoleValues),
});

export const updateUserRoleInputSchema = z.object({
  userId: z.uuid(),
  role: z.enum(userRoleValues),
});

export const deactivateUserInputSchema = z.object({
  userId: z.uuid(),
});
