"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type AuthActionState } from "@/features/auth/server/actions";

const initialState: AuthActionState = {};

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? (
        <p role="alert" className="rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-small text-danger">
          {state.error}
        </p>
      ) : null}

      <div>
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          className="mt-2"
        />
        {state.fieldErrors?.email?.[0] ? (
          <p id="email-error" className="mt-1.5 text-small text-danger">
            {state.fieldErrors.email[0]}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
          className="mt-2"
        />
        {state.fieldErrors?.password?.[0] ? (
          <p id="password-error" className="mt-1.5 text-small text-danger">
            {state.fieldErrors.password[0]}
          </p>
        ) : null}
      </div>

      <SubmitButton className="w-full" pendingLabel="Iniciando sesión…">
        Iniciar sesión
      </SubmitButton>
    </form>
  );
}
