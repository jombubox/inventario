"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { createLocation, deleteBox, updateLocation, renameQuickAddLocation } from "@/features/locations/server/location-service";
import { listQuickAddOptions } from "@/features/inventory/data/quick-add-queries";
import {
  errorState,
  type MutationState,
  validationState,
} from "@/features/shared/server/action-state";
import {
  createLocationMutationSchema,
  updateLocationMutationSchema,
  createQuickAddLocationSchema,
  renameQuickAddLocationSchema,
} from "@/validators/admin-location";
import { deleteBoxMutationSchema } from "@/validators/quick-add-inventory";
import { ConcurrentModificationError } from "@/features/shared/domain/service-errors";

type InlineLocationState = MutationState & {
  selectedLocationId?: string;
  options?: Awaited<ReturnType<typeof listQuickAddOptions>>;
};

export async function saveQuickAddLocationAction(formData: FormData): Promise<InlineLocationState> {
  await requireAdmin();
  const editing = formData.get("mode") === "edit";
  const parsed = editing
    ? renameQuickAddLocationSchema.safeParse({
        id: formData.get("id"), expectedUpdatedAt: formData.get("expectedUpdatedAt"),
        name: formData.get("name"),
      })
    : createQuickAddLocationSchema.safeParse({ code: formData.get("code"), name: formData.get("name") });
  if (!parsed.success) return validationState(parsed.error);
  try {
    const db = getDb();
    const location = "id" in parsed.data
      ? await renameQuickAddLocation(db, parsed.data)
      : await createLocation(db, { ...parsed.data, type: "WAREHOUSE", parentId: null, active: true, notes: null });
    revalidatePath("/admin", "layout");
    revalidatePath("/admin/ubicaciones");
    revalidatePath("/admin/inventario");
    return { status: "success", message: editing ? "Ubicación actualizada." : "Ubicación creada.",
      selectedLocationId: location.id, options: await listQuickAddOptions(db) };
  } catch (error) {
    if (error instanceof ConcurrentModificationError) {
      return { status: "error", message: "Otra persona cambió esta ubicación. Actualizamos las opciones; revisa el nombre antes de volver a guardar.", options: await listQuickAddOptions(getDb()) };
    }
    return errorState(error);
  }
}

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
