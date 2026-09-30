"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { createLocation, deleteBox, updateLocation } from "@/features/locations/server/location-service";
import {
  errorState,
  type MutationState,
  validationState,
} from "@/features/shared/server/action-state";
import {
  createLocationMutationSchema,
  updateLocationMutationSchema,
} from "@/validators/admin-location";
import { deleteBoxMutationSchema } from "@/validators/quick-add-inventory";

function locationFields(formData: FormData) {
  return {
    code: formData.get("code"),
    name: formData.get("name"),
    type: formData.get("type"),
    parentId: formData.get("parentId"),
    active: formData.get("active") === "on",
    notes: formData.get("notes"),
  };
}

export async function createLocationAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = createLocationMutationSchema.safeParse(locationFields(formData));
  if (!parsed.success) return validationState(parsed.error);
  await requireAdmin();
  try {
    await createLocation(getDb(), parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/ubicaciones");
    return { status: "success", message: "Ubicación creada." };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateLocationAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = updateLocationMutationSchema.safeParse({
    id: formData.get("id"),
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    ...locationFields(formData),
  });
  if (!parsed.success) return validationState(parsed.error);
  await requireAdmin();
  try {
    await updateLocation(getDb(), parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/ubicaciones");
    revalidatePath("/admin/inventario");
    return { status: "success", message: "Ubicación actualizada." };
  } catch (error) {
    return errorState(error);
  }
}

export async function deleteBoxAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = deleteBoxMutationSchema.safeParse({
    id: formData.get("id"),
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
  });
  if (!parsed.success) return validationState(parsed.error);
  await requireAdmin();
  try {
    const result = await deleteBox(getDb(), parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/ubicaciones");
    revalidatePath("/admin/inventario");
    return {
      status: "success",
      message: result.mode === "deleted"
        ? "Caja eliminada."
        : "La caja se desactivó para conservar su historial.",
    };
  } catch (error) {
    return errorState(error);
  }
}
