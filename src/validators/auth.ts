import { z } from "zod";

export const loginInputSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email("Ingresa un correo válido."))
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Ingresa tu contraseña.").max(128),
});
