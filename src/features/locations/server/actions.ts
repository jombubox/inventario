"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { requirePermission } from "@/features/auth/server/authorization";
import { createLocation, updateLocation } from "@/features/locations/server/location-service";
import {
  errorState,
  type MutationState,
  validationState,
} from "@/features/shared/server/action-state";
import {
  createLocationMutationSchema,
  updateLocationMutationSchema,
} from "@/validators/admin-location";

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
  const actor = await requirePermission("LOCATION_CREATE");
  try {
    await createLocation(getDb(), actor, parsed.data);
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
  const actor = await requirePermission("LOCATION_UPDATE");
  try {
    await updateLocation(getDb(), actor, parsed.data);
    revalidatePath("/admin/ubicaciones");
    revalidatePath("/admin/inventario");
    return { status: "success", message: "Ubicación actualizada." };
  } catch (error) {
    return errorState(error);
  }
}
