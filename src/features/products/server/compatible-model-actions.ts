"use server";

import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { resolveCompatibleModel } from "@/features/products/server/compatible-model-service";
import { errorState, validationState, type MutationState } from "@/features/shared/server/action-state";
import { compatibilityMutationSchema } from "@/validators/admin-product";

type InlineModelState = MutationState & {
  compatibility?: { brandId: string; model: string; notes: null };
};

export async function addCompatibleModelInlineAction(formData: FormData): Promise<InlineModelState> {
  await requireAdmin();
  const parsed = compatibilityMutationSchema.safeParse({ brandId: formData.get("brandId"), model: formData.get("model") });
  if (!parsed.success) return validationState(parsed.error);
  try {
    const result = await resolveCompatibleModel(getDb(), parsed.data);
    return {
      status: "success",
      message: result.reused ? "Este modelo ya existe; lo seleccionamos." : "Modelo agregado. Se guardará con el producto.",
      compatibility: result.compatibility,
    };
  } catch (error) {
    return errorState(error);
  }
}
