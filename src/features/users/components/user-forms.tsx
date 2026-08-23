"use client";

import { useActionState } from "react";

import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { initialMutationState } from "@/features/shared/domain/mutation-state";
import {
  createUserAction,
  deactivateUserAction,
  updateUserRoleAction,
} from "@/features/users/server/actions";

export function CreateUserForm() {
  const [state, action] = useActionState(createUserAction, initialMutationState);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div><Label htmlFor="user-name">Nombre</Label><Input id="user-name" name="name" autoComplete="off" className="mt-2" required /></div>
      <div><Label htmlFor="user-email">Correo</Label><Input id="user-email" name="email" type="email" autoComplete="off" className="mt-2" required /></div>
      <div><Label htmlFor="user-password">Contraseña inicial</Label><Input id="user-password" name="password" type="password" minLength={12} autoComplete="new-password" className="mt-2" required /><p className="mt-1 text-xs text-muted-foreground">Mínimo 12 caracteres. No se mostrará ni guardará en texto plano.</p></div>
      <div><Label htmlFor="user-role">Rol</Label><Select id="user-role" name="role" defaultValue="VIEWER" className="mt-2"><option value="VIEWER">Consulta</option><option value="EDITOR">Editor</option><option value="ADMIN">Administrador</option></Select></div>
      <div className="sm:col-span-2"><FormFeedback state={state} /></div><div className="sm:col-span-2 flex justify-end"><SubmitButton pendingLabel="Creando usuario…">Crear usuario</SubmitButton></div>
    </form>
  );
}

export function UserManagementForm({ userId, role, active, isCurrentUser }: { userId: string; role: string; active: boolean; isCurrentUser: boolean }) {
  const [roleState, roleAction] = useActionState(updateUserRoleAction, initialMutationState);
  const [deactivateState, deactivateAction] = useActionState(deactivateUserAction, initialMutationState);
  return (
    <div className="space-y-3">
      <form action={roleAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="userId" value={userId} /><div><Label htmlFor={`role-${userId}`} className="sr-only">Rol</Label><Select id={`role-${userId}`} name="role" defaultValue={role} className="h-9 min-w-36"><option value="VIEWER">Consulta</option><option value="EDITOR">Editor</option><option value="ADMIN">Administrador</option></Select></div><SubmitButton variant="outline" size="sm" pendingLabel="Guardando…">Cambiar rol</SubmitButton></form>
      <FormFeedback state={roleState} />
      {active ? <form action={deactivateAction} onSubmit={(event) => { if (!window.confirm("¿Desactivar este usuario y cerrar todas sus sesiones?")) event.preventDefault(); }}><input type="hidden" name="userId" value={userId} /><SubmitButton variant="ghost" size="sm" className="text-danger" pendingLabel="Desactivando…" disabled={isCurrentUser}>Desactivar</SubmitButton></form> : null}
      <FormFeedback state={deactivateState} />
    </div>
  );
}
