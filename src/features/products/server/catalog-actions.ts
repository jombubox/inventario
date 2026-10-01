"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import {
  archiveBrandCatalogEntry,
  archiveComponentTypeCatalogEntry,
  createBrandCatalogEntry,
  createComponentTypeCatalogEntry,
  updateBrandCatalogEntry,
  updateComponentTypeCatalogEntry,
} from "@/features/products/server/catalog-service";
import type { MutationState } from "@/features/shared/domain/mutation-state";
import { DuplicateEntityError } from "@/features/shared/domain/service-errors";
import { errorState, validationState } from "@/features/shared/server/action-state";
import {
  archiveCatalogEntryMutationSchema,
  createCatalogEntryMutationSchema,
  updateCatalogEntryMutationSchema,
} from "@/validators/admin-catalog";

export type InlineCatalogState = MutationState & {
  entry?: { id: string; name: string; code: string };
  reused?: boolean;
};

function revalidateCatalogPages() {
  revalidatePath("/admin");
  revalidatePath("/admin/productos");
  revalidatePath("/admin/marcas");
  revalidatePath("/admin/tipos-de-pieza");
}

async function inlineCreate(
  formData: FormData,
  kind: "brand" | "componentType",
): Promise<InlineCatalogState> {
  const parsed = createCatalogEntryMutationSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return validationState(parsed.error);
  await requireAdmin();
  try {
    const result = kind === "brand"
      ? await createBrandCatalogEntry(getDb(), parsed.data)
      : await createComponentTypeCatalogEntry(getDb(), parsed.data);
    revalidateCatalogPages();
    const noun = kind === "brand" ? "marca" : "tipo de pieza";
    const article = kind === "brand" ? "la" : "el";
    return {
      status: "success",
      message: result.created
        ? `Se creó ${article} ${noun}.`
        : kind === "brand"
          ? "Esta marca ya existe; la seleccionamos."
          : "Este tipo de pieza ya existe; lo seleccionamos.",
      entry: result.entry,
      reused: !result.created,
    };
  } catch (error) {
    if (error instanceof DuplicateEntityError) {
      return {
        status: "error",
        message: kind === "brand" ? "Esta marca ya existe." : "Este tipo de pieza ya existe.",
      };
    }
    return errorState(error);
  }
}

export async function createBrandInlineAction(formData: FormData) {
  return inlineCreate(formData, "brand");
}

export async function createComponentTypeInlineAction(formData: FormData) {
  return inlineCreate(formData, "componentType");
}

export async function createBrandAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const result = await inlineCreate(formData, "brand");
  return { status: result.status, message: result.message, fieldErrors: result.fieldErrors };
}

export async function createComponentTypeAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const result = await inlineCreate(formData, "componentType");
  return { status: result.status, message: result.message, fieldErrors: result.fieldErrors };
}

async function updateCatalogAction(
  formData: FormData,
  kind: "brand" | "componentType",
): Promise<MutationState> {
  const parsed = updateCatalogEntryMutationSchema.safeParse({
    id: formData.get("id"),
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    name: formData.get("name"),
  });
  if (!parsed.success) return validationState(parsed.error);
  await requireAdmin();
  try {
    if (kind === "brand") await updateBrandCatalogEntry(getDb(), parsed.data);
    else await updateComponentTypeCatalogEntry(getDb(), parsed.data);
    revalidateCatalogPages();
    return {
      status: "success",
      message: kind === "brand" ? "Marca actualizada." : "Tipo de pieza actualizado.",
    };
  } catch (error) {
    if (error instanceof DuplicateEntityError) {
      return {
        status: "error",
        message: kind === "brand" ? "Esta marca ya existe." : "Este tipo de pieza ya existe.",
      };
    }
    return errorState(error);
  }
}

export async function updateBrandAction(
  _previousState: MutationState,
  formData: FormData,
) {
  return updateCatalogAction(formData, "brand");
}

export async function updateComponentTypeAction(
  _previousState: MutationState,
  formData: FormData,
) {
  return updateCatalogAction(formData, "componentType");
}

async function archiveCatalogAction(
  formData: FormData,
  kind: "brand" | "componentType",
): Promise<MutationState> {
  const parsed = archiveCatalogEntryMutationSchema.safeParse({
    id: formData.get("id"),
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
  });
  if (!parsed.success) return validationState(parsed.error);
  await requireAdmin();
  try {
    if (kind === "brand") await archiveBrandCatalogEntry(getDb(), parsed.data);
    else await archiveComponentTypeCatalogEntry(getDb(), parsed.data);
    revalidateCatalogPages();
    return {
      status: "success",
      message: kind === "brand" ? "Marca desactivada." : "Tipo de pieza desactivado.",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function archiveBrandAction(
  _previousState: MutationState,
  formData: FormData,
) {
  return archiveCatalogAction(formData, "brand");
}

export async function archiveComponentTypeAction(
  _previousState: MutationState,
  formData: FormData,
) {
  return archiveCatalogAction(formData, "componentType");
}
