"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/authorization";
import {
  errorState,
  type MutationState,
  validationState,
} from "@/features/shared/server/action-state";
import {
  createAdministrativeUser,
  deactivateUser,
  updateUserRole,
} from "@/features/users/server/user-service";
import {
  createUserInputSchema,
  deactivateUserInputSchema,
  updateUserRoleInputSchema,
} from "@/validators/auth";

export async function createUserAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = createUserInputSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return validationState(parsed.error);
  const actor = await requireAdmin();
  try {
    await createAdministrativeUser(getDb(), actor, parsed.data);
    revalidatePath("/admin/usuarios");
    return { status: "success", message: "Usuario creado." };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateUserRoleAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = updateUserRoleInputSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return validationState(parsed.error);
  const actor = await requireAdmin();
  try {
    await updateUserRole(getDb(), actor, parsed.data);
    revalidatePath("/admin/usuarios");
    return { status: "success", message: "Rol actualizado." };
  } catch (error) {
    return errorState(error);
  }
}

export async function deactivateUserAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = deactivateUserInputSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return validationState(parsed.error);
  const actor = await requireAdmin();
  try {
    await deactivateUser(getDb(), actor, parsed.data.userId);
    revalidatePath("/admin/usuarios");
    return { status: "success", message: "Usuario desactivado y sesiones revocadas." };
  } catch (error) {
    return errorState(error);
  }
}
