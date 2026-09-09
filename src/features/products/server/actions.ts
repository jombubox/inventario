"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { revalidatePublicCatalog } from "@/features/catalog/server/revalidation";
import { archiveProduct, createProduct, updateProduct } from "@/features/products/server/product-service";
import {
  errorState,
  type MutationState,
  validationState,
} from "@/features/shared/server/action-state";
import {
  archiveProductMutationSchema,
  createProductMutationSchema,
  updateProductMutationSchema,
} from "@/validators/admin-product";

function parseCompatibilities(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== "string" || value === "") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function productFields(formData: FormData) {
  return {
    brandId: formData.get("brandId"),
    componentTypeId: formData.get("componentTypeId"),
    partNumber: formData.get("partNumber"),
    title: formData.get("title"),
    description: formData.get("description"),
    salePrice: formData.get("salePrice"),
    currency: formData.get("currency") ?? "MXN",
    status: formData.get("status"),
    isPublic: formData.get("isPublic") === "on",
    compatibilities: parseCompatibilities(formData.get("compatibilities")),
  };
}

export async function createProductAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = createProductMutationSchema.safeParse(productFields(formData));
  if (!parsed.success) return validationState(parsed.error);

  await requireAdmin();
  let productId: string;
  try {
    const product = await createProduct(getDb(), parsed.data);
    productId = product.id;
  } catch (error) {
    return errorState(error);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/productos");
  revalidatePublicCatalog();
  redirect(`/admin/productos/${productId}?notice=created`);
}

export async function updateProductAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = updateProductMutationSchema.safeParse({
    id: formData.get("id"),
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    ...productFields(formData),
  });
  if (!parsed.success) return validationState(parsed.error);

  await requireAdmin();
  let productSlug: string;
  try {
    const product = await updateProduct(getDb(), parsed.data);
    productSlug = product.slug;
  } catch (error) {
    return errorState(error);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${parsed.data.id}`);
  revalidatePublicCatalog(productSlug);
  redirect(`/admin/productos/${parsed.data.id}?notice=updated`);
}

export async function archiveProductAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = archiveProductMutationSchema.safeParse({
    id: formData.get("id"),
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
  });
  if (!parsed.success) return validationState(parsed.error);

  await requireAdmin();
  let productSlug: string;
  try {
    const product = await archiveProduct(getDb(), parsed.data);
    productSlug = product.slug;
  } catch (error) {
    return errorState(error);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${parsed.data.id}`);
  revalidatePublicCatalog(productSlug);
  return { status: "success", message: "Producto archivado." };
}
