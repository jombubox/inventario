"use server";
import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { archiveCategories, archiveMutationSchema } from "@/features/archives/domain/archives";
import { restoreArchivedRecord } from "./archive-service";
import { revalidateArchiveViews } from "./revalidation";
import { setLocationArchived } from "@/features/locations/server/location-service";
import { errorState, validationState, type MutationState } from "@/features/shared/server/action-state";

export async function restoreArchivedAction(_state: MutationState, formData: FormData): Promise<MutationState> {
  await requireAdmin();
  const parsed = archiveMutationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationState(parsed.error);
  try {
    await restoreArchivedRecord(getDb(), parsed.data);
    revalidateArchiveViews();
    const noun = archiveCategories.find((item) => item.key === parsed.data.categoria)!.singular;
    return { status: "success", message: `${noun} restaurad${["Marca", "Ubicación", "Caja"].includes(noun) ? "a" : "o"} correctamente.` };
  } catch (error) { return errorState(error); }
}

export async function archiveLocationAction(_state: MutationState, formData: FormData): Promise<MutationState> {
  await requireAdmin();
  const parsed = archiveMutationSchema.safeParse({ ...Object.fromEntries(formData), categoria: "ubicaciones" });
  if (!parsed.success) return validationState(parsed.error);
  try {
    await setLocationArchived(getDb(), parsed.data, true);
    revalidateArchiveViews();
    return { status: "success", message: "Ubicación archivada correctamente." };
  } catch (error) { return errorState(error); }
}
