"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { requireAdmin } from "@/features/auth/server/admin-auth";
import { revalidatePublicCatalog } from "@/features/catalog/server/revalidation";
import {
  adjustInventoryQuantity,
  createInventoryItem,
  moveInventoryItem,
  recordStockMovement,
  updateInventoryDetails,
} from "@/features/inventory/server/inventory-service";
import { quickAddInventory } from "@/features/inventory/server/quick-add-service";
import {
  errorState,
  type MutationState,
  validationState,
} from "@/features/shared/server/action-state";
import {
  adjustInventoryMutationSchema,
  createInventoryMutationSchema,
  moveInventoryMutationSchema,
  updateInventoryDetailsMutationSchema,
  stockMovementMutationSchema,
} from "@/validators/admin-inventory";
import { quickAddInventoryMutationSchema } from "@/validators/quick-add-inventory";

export type QuickAddMutationState = MutationState & {
  productId?: string;
  productCreated?: boolean;
};

function parseStringArray(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== "string" || value === "") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function quickAddInventoryAction(
  _previousState: QuickAddMutationState,
  formData: FormData,
): Promise<QuickAddMutationState> {
  const parsed = quickAddInventoryMutationSchema.safeParse({
    productMode: formData.get("productMode"),
    productId: formData.get("productId"),
    brandId: formData.get("brandId"),
    customBrandName: formData.get("customBrandName"),
    componentTypeId: formData.get("componentTypeId"),
    customComponentTypeName: formData.get("customComponentTypeName"),
    partNumber: formData.get("partNumber"),
    primarySerialNumber: formData.get("primarySerialNumber"),
    secondarySerialNumbers: parseStringArray(formData.get("secondarySerialNumbers")),
    compatibilities: parseStringArray(formData.get("compatibilities")),
    title: formData.get("title"),
    locationId: formData.get("locationId"),
    boxMode: formData.get("boxMode"),
    boxId: formData.get("boxId"),
    newBoxCode: formData.get("newBoxCode"),
    newBoxName: formData.get("newBoxName"),
    bagLabel: formData.get("bagLabel"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return validationState(parsed.error);

  await requireAdmin();
  try {
    const result = await quickAddInventory(getDb(), parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/movimientos");
    revalidatePath("/admin/auditoria");
    revalidatePath("/admin/productos");
    revalidatePath("/admin/ubicaciones");
    revalidatePublicCatalog(result.product.slug);
    const bag = parsed.data.bagLabel ? ` · ${parsed.data.bagLabel}` : "";
    return {
      status: "success",
      message: `${parsed.data.quantity} unidad(es) agregadas correctamente a ${result.box.name}${bag}.`,
      productId: result.product.id,
      productCreated: result.productCreated,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function createInventoryAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = createInventoryMutationSchema.safeParse({
    productId: formData.get("productId"),
    locationId: formData.get("locationId"),
    quantity: formData.get("quantity"),
    condition: formData.get("condition"),
    status: formData.get("status"),
    acquiredAt: formData.get("acquiredAt"),
    acquisitionSource: formData.get("acquisitionSource"),
    purchaseCost: formData.get("purchaseCost"),
    notes: formData.get("notes"),
    legacyBagNumber: formData.get("legacyBagNumber"),
    legacyLocationCode: formData.get("legacyLocationCode"),
  });
  if (!parsed.success) return validationState(parsed.error);

  await requireAdmin();
  try {
    const item = await createInventoryItem(getDb(), parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/productos");
    revalidatePublicCatalog();
    return { status: "success", message: `Inventario ${item.inventoryCode} creado.` };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateInventoryDetailsAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = updateInventoryDetailsMutationSchema.safeParse({
    id: formData.get("id"),
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    condition: formData.get("condition"),
    acquiredAt: formData.get("acquiredAt"),
    acquisitionSource: formData.get("acquisitionSource"),
    purchaseCost: formData.get("purchaseCost"),
    notes: formData.get("notes"),
    legacyBagNumber: formData.get("legacyBagNumber"),
    legacyLocationCode: formData.get("legacyLocationCode"),
  });
  if (!parsed.success) return validationState(parsed.error);

  await requireAdmin();
  try {
    await updateInventoryDetails(getDb(), parsed.data);
    revalidatePath("/admin/inventario");
    revalidatePublicCatalog();
    return { status: "success", message: "Datos del inventario actualizados." };
  } catch (error) {
    return errorState(error);
  }
}

export async function moveInventoryAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = moveInventoryMutationSchema.safeParse({
    id: formData.get("id"),
    toLocationId: formData.get("toLocationId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return validationState(parsed.error);

  await requireAdmin();
  try {
    await moveInventoryItem(getDb(), parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/productos");
    revalidatePublicCatalog();
    return { status: "success", message: "Inventario movido." };
  } catch (error) {
    return errorState(error);
  }
}

export async function adjustInventoryAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = adjustInventoryMutationSchema.safeParse({
    id: formData.get("id"),
    newQuantity: formData.get("newQuantity"),
    newStatus: formData.get("newStatus"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return validationState(parsed.error);

  await requireAdmin();
  try {
    await adjustInventoryQuantity(getDb(), parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/productos");
    revalidatePublicCatalog();
    return { status: "success", message: "Cantidad ajustada." };
  } catch (error) {
    return errorState(error);
  }
}

export async function stockMovementAction(
  _previousState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = stockMovementMutationSchema.safeParse({
    id: formData.get("id"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    resultingStatus: formData.get("resultingStatus"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return validationState(parsed.error);

  await requireAdmin();
  try {
    await recordStockMovement(getDb(), parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/movimientos");
    revalidatePath("/admin/productos");
    revalidatePublicCatalog();
    return { status: "success", message: "Movimiento de stock registrado." };
  } catch (error) {
    return errorState(error);
  }
}
